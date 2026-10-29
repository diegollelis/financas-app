import {
  cardFunctionLabels,
  cardFunctionSchema,
  formatCents,
  formatIsoDate,
  formatPeriod,
  occurredOnRowLabels,
  paymentMethodLabels,
  PENDING_LABEL,
  settledLabels,
  type Card,
  type Category,
  type Import,
  type ImportKind,
  type StatementBank,
  type Merchant,
  type TransactionType,
} from '@financas/shared';
import { cn } from 'cn';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { InfoTip } from '@/components/info-tip';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { SectionCard } from '@/components/section-card';
import { SegmentedControl } from '@/components/segmented-control';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StepIndicator } from '@/components/step-indicator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { PageActionButton } from '@/components/page-action-button';
import { CategorySelect } from '@/features/categories/category-picker';
import { CARD_LIST, CARD_ROW } from '@/features/view-mode/row-styles';
import { apiErrorMessage } from '@/lib/error-message';
import { ImportRowForm } from './import-row-form';
import {
  groupByPeriod,
  groupTotals,
  readyImport,
  resolveCategory,
  rowProblems,
  takesMatch,
  takesPart,
  unmatchedCategories,
  type AccountBill,
  type AccountMatch,
  type AccountPart,
  type ReviewRow,
} from './review';
import {
  accountGroup,
  accountSummary,
  billText,
  matchText,
  partText,
  type AccountGroup,
} from './account-review';
import {
  newCategoryName,
  newCategoryValue,
  useResolveCategory,
} from '@/features/categories/new-category';
import {
  applyToSameTitle,
  mergeStatementRows,
  pendingMerchants,
  sameTitleCount,
} from './statement-review';

/**
 * A card statement's review (ADR 0055 notes): its reference month and due date, chosen here, and
 * the rows as the statement gives them for these (null while the month's transactions load).
 */
export type StatementReviewProps = {
  period: string;
  dueDate: string | null;
  onPeriodChange: (period: string) => void;
  onDueDateChange: (dueDate: string | null) => void;
  baseRows: ReviewRow[] | null;
  notices: string[];
};
import { useCreateImport } from './use-imports';
import {
  cardLinesByFunction,
  defaultImportCard,
  withImportCards,
  type ImportCards,
} from './import-cards';
import { CardSelect } from '@/features/cards/card-select';

const typeLabel = { CREDIT: 'entrada', DEBIT: 'saída' } as const;

/** A notice of what could count twice or stay out: the warning colors (ADR 0036 tokens). */
const NOTICE_CLASS = 'border-warning/40 bg-warning-muted rounded-lg border p-3';

/** "a, b e c": a list as written in Portuguese. */
const listed = (parts: string[]) =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`;

const faturas = (count: number) => (count === 1 ? '1 fatura' : `${count} faturas`);

/**
 * "4 lançamentos novos, 6 conferidos e 1 fatura paga": what an account statement's import did
 * (ADR 0061), the card bills it paid too (ADR 0062 note).
 */
function importedSummary(created: number, reconciled: number, bills: number) {
  return listed([
    `${created} ${created === 1 ? 'lançamento novo' : 'lançamentos novos'}`,
    ...(reconciled > 0 ? [`${reconciled} ${reconciled === 1 ? 'conferido' : 'conferidos'}`] : []),
    ...(bills > 0 ? [`${faturas(bills)} ${bills === 1 ? 'paga' : 'pagas'}`] : []),
  ]);
}

/**
 * The button of an account statement (ADR 0061): what will be created, what checked and the card
 * bills it pays (ADR 0062 note), the first verb capitalized: "Conferir 1 e pagar 1 fatura".
 */
function accountButton(created: number, matched: number, bills: number) {
  const text = listed([
    ...(created > 0 ? [`importar ${created} ${created === 1 ? 'novo' : 'novos'}`] : []),
    ...(matched > 0 ? [`conferir ${matched}`] : []),
    ...(bills > 0 ? [`pagar ${faturas(bills)}`] : []),
  ]);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : 'Importar';
}

const accountGroups = [
  { value: 'ALL', label: 'Todos' },
  { value: 'NEW', label: 'Novos' },
  { value: 'MATCHED', label: 'Lançados' },
  { value: 'OUT', label: 'Fora' },
] as const;

/** "2026-08 a 2026-09" of a previous import overlaps what is about to be imported. */
function overlapsPrevious(imports: Import[], rows: ReviewRow[]) {
  const periods = rows.filter((row) => row.included && row.period).map((row) => row.period ?? '');
  return imports.filter((previous) =>
    periods.some((period) => period >= previous.firstPeriod && period <= previous.lastPeriod),
  );
}

function RowItem({
  row,
  categoryName,
  categoryOptions,
  problems,
  onToggle,
  onCategory,
  onEdit,
  onRefuse,
}: {
  row: ReviewRow;
  /** The app's category the row goes to, or null while there is none. */
  categoryName: string | null;
  /** The categories of its type, to pick one on the card. */
  categoryOptions: Category[];
  problems: string[];
  onToggle: (included: boolean) => void;
  onCategory: (categoryId: string) => void;
  onEdit: (trigger: HTMLButtonElement) => void;
  /** An account statement's movement (ADR 0061): not the transaction it matched, or it after all. */
  onRefuse: (refused: boolean) => void;
}) {
  const label = row.description || `Linha ${row.line}`;
  // A movement already in the app creates nothing: what it matched is said instead (ADR 0061).
  const matched = takesMatch(row) || takesPart(row) || Boolean(row.bill);
  // A statement's line without a category picks it right on the card, as most lines of a first
  // statement have none yet (ADR 0055 note).
  const picksCategory =
    Boolean(row.statementTitle) && !categoryName && row.type !== null && !matched;
  // A statement's line unchecked by a rule says only why; checking it shows what it lacks.
  const shown = row.statementTitle && !row.included ? [] : problems;
  const visibleProblems = picksCategory
    ? shown.filter((problem) => problem !== 'Escolha a categoria.')
    : shown;
  const blocked = problems.length > 0 && !row.statementTitle;
  return (
    // The box beside the checkbox has its own 44px target: 8px of side room on the phone.
    <li className={cn(CARD_ROW, 'flex items-start gap-3 px-2 md:px-4')}>
      {/* A 44px target on the phone (ADR 0036): the label around the box toggles it too. */}
      <label
        htmlFor={`import-row-${row.line}`}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center md:size-8"
      >
        <Checkbox
          id={`import-row-${row.line}`}
          checked={row.included && !blocked}
          disabled={blocked}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={`Importar ${label}`}
        />
      </label>
      <div className="grid min-w-0 flex-1 gap-1">
        {/* An account's movement always says what it is; a card's line, when already in the app. */}
        {(row.externalId || row.match) && row.included && (
          <Badge
            variant="outline"
            className={cn(
              'justify-self-start',
              matched &&
                (row.part || row.match?.sameAmount || row.bill?.sameAmount) &&
                'border-transparent bg-success-muted',
              matched &&
                ((row.match && !row.match.sameAmount) || (row.bill && !row.bill.sameAmount)) &&
                'border-transparent bg-warning-muted',
            )}
          >
            {!matched
              ? 'Novo'
              : row.bill
                ? 'Paga a fatura'
                : row.part
                  ? row.type === 'CREDIT'
                    ? 'Recebimento parcial'
                    : 'Pagamento parcial'
                  : !row.match!.sameAmount
                    ? 'Valor diferente'
                    : row.match!.pending && !row.match!.card
                      ? 'Quita um pendente'
                      : 'Já lançado'}
          </Badge>
        )}
        <p className="font-medium break-words">{label}</p>
        {/* The bank's text, to check against the statement (ADR 0055 note). */}
        {row.statementTitle && row.statementTitle !== row.description && (
          <p className="text-muted-foreground text-sm break-words">
            No extrato: {row.statementTitle}
          </p>
        )}
        {row.part && row.included && (
          <p className="text-muted-foreground text-sm">
            {row.matchRefused
              ? `Não é parte de "${row.part.description}": entra como um lançamento novo.`
              : partText(row as ReviewRow & { part: AccountPart })}
          </p>
        )}
        {/* The bill it pays (ADR 0062 note), checked or not: what importing does to it. */}
        {row.bill && (
          <p className="text-muted-foreground text-sm">
            {billText(row as ReviewRow & { bill: AccountBill })}
          </p>
        )}
        {row.match && row.included && (
          <p className="text-muted-foreground text-sm">
            {row.matchRefused && row.match.sameAmount
              ? `Não é "${row.match.description}": entra como um lançamento novo.`
              : matchText(row as ReviewRow & { match: AccountMatch })}
          </p>
        )}
        {row.match && row.included && !row.match.sameAmount && (
          // The choice stays on the card (ADR 0061): the same transaction, or another one.
          <RadioGroup
            aria-label={`O que é ${label}`}
            value={row.matchRefused ? 'NEW' : 'MATCH'}
            onValueChange={(value) => onRefuse(value === 'NEW')}
            className="mt-1 gap-1"
          >
            {[
              {
                value: 'MATCH',
                text: `É este: fica com o valor do banco, ${formatCents(row.amountCents ?? 0)}`,
              },
              { value: 'NEW', text: 'É outro: importar como lançamento novo' },
            ].map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 cursor-pointer items-center gap-2 text-sm md:min-h-8"
              >
                <RadioGroupItem value={option.value} />
                {option.text}
              </label>
            ))}
          </RadioGroup>
        )}
        {!matched && !(row.externalId && row.skipped && !row.included) && (
          <p className="text-muted-foreground flex flex-wrap gap-x-3 text-sm">
            <span>
              {categoryName ??
                (row.statementTitle
                  ? 'Sem categoria'
                  : `${row.categoryName || 'Sem categoria'} (sem correspondência)`)}
            </span>
            {row.merchantName && <span>{row.merchantName}</span>}
            {row.personName && row.type && (
              <span>
                {row.type === 'CREDIT' ? 'A receber de' : 'A pagar para'} {row.personName}
              </span>
            )}
            {row.paymentMethod && <span>{paymentMethodLabels[row.paymentMethod]}</span>}
            {row.occurredOn && !(row.externalId && row.occurredOn === row.settledAt) && (
              <span>
                {row.type ? occurredOnRowLabels[row.type] : 'Em'} {formatIsoDate(row.occurredOn)}
              </span>
            )}
            {row.dueDate && <span>Vence em {formatIsoDate(row.dueDate)}</span>}
            <span>
              {row.settledAt
                ? `${row.type ? settledLabels[row.type] : 'Pago ou recebido'} em ${formatIsoDate(row.settledAt)}`
                : PENDING_LABEL}
            </span>
            <span>Linha {row.line}</span>
          </p>
        )}
        {picksCategory && row.included && (
          <div className="mt-1 grid max-w-xs gap-1">
            <FormField id={`import-row-${row.line}-category`} label={`Categoria de ${label}`}>
              <CategorySelect value="" onChange={onCategory} options={categoryOptions} allowAdd />
            </FormField>
          </div>
        )}
        {/* Optional: a hint, not a problem (ADR 0055 note), once what is required is there. */}
        {row.statementTitle &&
          row.included &&
          !matched &&
          categoryName &&
          !row.merchantName &&
          row.type === 'DEBIT' && (
            // A quiet mark: why it matters is in "Editar" ("Lembrar como apelido").
            <Badge variant="outline" className="justify-self-start">
              Sem estabelecimento
            </Badge>
          )}
        {[...visibleProblems, ...row.warnings].map((message) => (
          <p
            key={message}
            className={
              visibleProblems.includes(message)
                ? 'text-destructive flex gap-1.5 text-sm'
                : 'text-muted-foreground flex gap-1.5 text-sm'
            }
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {message}
          </p>
        ))}
      </div>
      <div className="grid shrink-0 justify-items-end gap-2">
        <span className="text-base font-semibold tabular-nums">
          {row.amountCents && row.amountCents > 0 ? formatCents(row.amountCents) : 'Sem valor'}
        </span>
        {row.bill && row.included ? (
          // "Não é esta" leaves it out, as before bills were matched (ADR 0062 note).
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Não é esta: ${label}`}
            onClick={() => onToggle(false)}
          >
            Não é esta
          </Button>
        ) : ((row.match && row.match.sameAmount) || row.part) && row.included ? (
          // "Não é este" turns it into a new transaction; "É este" takes it back (ADR 0061).
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${row.matchRefused ? 'É este' : 'Não é este'}: ${label}`}
            onClick={() => onRefuse(!row.matchRefused)}
          >
            {row.matchRefused ? 'É este' : 'Não é este'}
          </Button>
        ) : null}
        {!matched && (
          <Button
            variant={blocked ? 'secondary' : 'ghost'}
            size="sm"
            aria-label={`${blocked ? 'Corrigir' : 'Editar'} ${label}`}
            onClick={(event) => onEdit(event.currentTarget)}
          >
            {blocked ? 'Corrigir' : 'Editar'}
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * The preview before importing (ADR 0040): the rows by competência with their totals, each one
 * checked or not, editable in a form; rows with errors are fixed here or left out; spreadsheet
 * categories the app does not have are matched to one of its own. Nothing reaches the API until
 * "Importar".
 */
export function ImportReview({
  workspaceId,
  initialRows,
  categories,
  merchants,
  previousImports,
  statement,
  account,
  source,
  cards,
  defaultLabel,
  heading,
  onChooseAnother,
  onImported,
}: {
  workspaceId: string;
  initialRows: ReviewRow[];
  categories: Category[];
  /** Offered when choosing a row's merchant (a card statement's review, ADR 0055). */
  merchants?: Merchant[];
  previousImports: Import[];
  /** A card statement (ADR 0055): its month and due date, and what the review found. */
  statement?: StatementReviewProps;
  /**
   * An account statement (ADR 0061): its movements compared with what is in the app, how many
   * were imported before (left out), and what to warn about.
   */
  account?: { knownCount: number; notices: string[] };
  /** What it imports and from which bank (ADR 0060), recorded with the import. */
  source: { kind: ImportKind; bank: StatementBank | null };
  /**
   * The workspace's cards, for the lines in Crédito and Débito (ADR 0062 note): one card per
   * function for the whole file, `fixed` when chosen before (a card statement's).
   */
  cards: { list: Card[]; fixed?: ImportCards };
  /** The "Origem" it starts with ("Fatura Nubank", "Planilha modelo"). */
  defaultLabel: string;
  /** The step's title and what it reviews ("Revisar fatura do cartão", "Nubank · 50 linhas"). */
  heading: { title: string; subtitle: string };
  onChooseAnother: () => void;
  onImported: (firstPeriod: string) => void;
}) {
  const [rows, setRows] = useState(initialRows);
  const [label, setLabel] = useState(defaultLabel);
  // A new month or due date gives new rows; what the person chose on a row stays (ADR 0055 note).
  const [base, setBase] = useState(statement?.baseRows ?? null);
  if (statement?.baseRows && statement.baseRows !== base) {
    const previousPeriod = base?.[0]?.period ?? null;
    setBase(statement.baseRows);
    setRows((current) => mergeStatementRows(current, statement.baseRows!, previousPeriod));
  }
  const missingDueDate = Boolean(statement) && !statement?.dueDate;
  const [matches, setMatches] = useState<ReadonlyMap<string, string>>(new Map());
  // The line being edited; the button that opened it gets the focus back.
  const [editing, setEditing] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const create = useCreateImport(workspaceId);

  const ready = readyImport(rows, categories, matches);
  const readyCount = ready.transactions.length + ready.plans.length;
  // The card of each function the lines going in use (ADR 0062 note): chosen here, chosen
  // before (a card statement's), or the only one there is.
  const [pickedCards, setPickedCards] = useState<ImportCards>({});
  // Of every checked line that creates something, complete or not: the card is asked up front.
  const cardLines = cardLinesByFunction(
    rows.filter((row) => row.included && !takesMatch(row) && !takesPart(row)),
  );
  const cardFunctions = cardFunctionSchema.options.filter((role) => (cardLines[role] ?? 0) > 0);
  const chosenCards: ImportCards = Object.fromEntries(
    cardFunctionSchema.options.map((role) => [
      role,
      pickedCards[role] ?? cards.fixed?.[role] ?? defaultImportCard(cards.list, role, source.bank),
    ]),
  );
  const askedCards = cardFunctions.filter((role) => !cards.fixed?.[role]);
  const missingCard = cardFunctions.find((role) => !chosenCards[role]);
  // Optional, but worth a word before importing (ADR 0055 note).
  const withoutMerchant =
    statement || account
      ? rows.filter(
          (row) =>
            row.included &&
            !takesMatch(row) &&
            !takesPart(row) &&
            row.type === 'DEBIT' &&
            !row.merchantName.trim() &&
            rowProblems(row, resolveCategory(row, categories, matches)).length === 0,
        ).length
      : 0;
  const unmatched = unmatchedCategories(rows, categories).filter(
    (entry) => !matches.has(entry.key),
  );
  // A statement may be imported again on purpose: what is already in comes unchecked instead.
  // An account statement knows what came by the bank's identifiers (ADR 0061).
  const overlapping = statement || account ? [] : overlapsPrevious(previousImports, rows);
  const nameOf = (id: string | null) => {
    // One to create on import says so.
    const added = id && newCategoryName(id);
    if (added) return `${added} (nova)`;
    return categories.find((category) => category.id === id)?.name ?? null;
  };
  const editingRow = rows.find((row) => row.line === editing);
  /** What keeps a row out, if anything. A spreadsheet category's "Escolha a categoria" is
   * answered above, for every row of that name at once, so it is not repeated on each row. */
  const check = (row: ReviewRow) => {
    const categoryId = resolveCategory(row, categories, matches);
    const problems = rowProblems(row, categoryId).filter(
      (problem) => !(problem === 'Escolha a categoria.' && row.type && row.categoryName),
    );
    return { categoryId, problems };
  };
  // The check before importing (avaliação externa): what goes in, adding up, and what does not.
  // A plan counts its first installment, the one of this statement.
  const goingIn = [...ready.transactions, ...ready.plans];
  const credits = goingIn
    .filter((transaction) => transaction.type === 'CREDIT')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const debits = goingIn
    .filter((transaction) => transaction.type === 'DEBIT')
    .reduce((sum, transaction) => sum + transaction.amountCents, 0);
  const withProblems = rows.filter((row) => check(row).problems.length > 0);
  const waitingForCategory = unmatched.reduce((sum, entry) => sum + entry.rowCount, 0);
  // Hides rows from the view only: nothing leaves the import because of it.
  const [onlyProblems, setOnlyProblems] = useState(false);
  const filtering = onlyProblems && withProblems.length > 0;
  // An account statement's review shows one group at a time, if asked (ADR 0061).
  const [group, setGroup] = useState<AccountGroup | 'ALL'>('ALL');
  const visible = account
    ? group === 'ALL'
      ? rows
      : rows.filter((row) => accountGroup(row) === group)
    : filtering
      ? withProblems
      : rows;
  const found = account ? accountSummary(rows) : null;

  // The review is a step of its own: leaving it with choices made asks first, since they live
  // only here (the file is read on the device and never kept).
  const dirty = rows.some((row) => row.touched) || matches.size > 0 || label !== defaultLabel;
  const leaving = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    // Closing or reloading the tab: the browser's own warning, which no page can word.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const [discarding, setDiscarding] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const cancel = () => (dirty ? setDiscarding(true) : onChooseAnother());

  const update = (line: number, change: (row: ReviewRow) => ReviewRow) =>
    setRows((current) => current.map((row) => (row.line === line ? change(row) : row)));

  const category = useResolveCategory(workspaceId, categories);
  const submit = async () => {
    // The categories added in the review are created (or reactivated) first, one per name and
    // type (ADR 0040 note); if the import then fails, they stay, like the merchants.
    const created = new Map<string, string>();
    try {
      for (const item of [...ready.transactions, ...ready.plans]) {
        const key = `${item.type}|${item.categoryId}`;
        if (newCategoryName(item.categoryId) === null || created.has(key)) continue;
        created.set(key, await category.resolve(item.categoryId, item.type));
      }
    } catch {
      return; // Shown below, from category.error.
    }
    const real = <T extends { type: TransactionType; categoryId: string }>(item: T): T => ({
      ...item,
      categoryId: created.get(`${item.type}|${item.categoryId}`) ?? item.categoryId,
    });
    create.mutate(
      {
        transactions: withImportCards(ready.transactions.map(real), chosenCards),
        ...(ready.plans.length > 0 && {
          plans: withImportCards(ready.plans.map(real), chosenCards),
        }),
        ...(ready.aliases.length > 0 && { aliases: ready.aliases }),
        ...(ready.matches.length > 0 && { matches: ready.matches }),
        ...(ready.parts.length > 0 && { parts: ready.parts }),
        ...(ready.bills.length > 0 && { bills: ready.bills }),
        label,
        kind: source.kind,
        bank: source.bank,
        ...(cards.fixed?.CREDIT && { cardId: cards.fixed.CREDIT }),
        ...(statement?.dueDate && { statementDueDate: statement.dueDate }),
      },
      {
        onSuccess: (created) => {
          toast.success(
            account
              ? importedSummary(
                  created.transactionCount - created.partCount,
                  created.reconciledCount + created.partCount,
                  created.billCount,
                )
              : `${created.transactionCount} ${created.transactionCount === 1 ? 'lançamento importado' : 'lançamentos importados'}${
                  created.reconciledCount > 0
                    ? ` e ${created.reconciledCount} ${created.reconciledCount === 1 ? 'conferido' : 'conferidos'}`
                    : ''
                }`,
          );
          leaving.current = true;
          onImported(created.firstPeriod);
        },
      },
    );
  };

  // "Marcar todas" (ADR 0040 note): over the rows in sight, leaving out what the app unchecked
  // for a reason (`skipped`) and a template row with errors, which never goes; unchecking takes
  // every row in sight.
  const blockedRow = (row: ReviewRow) => !row.statementTitle && check(row).problems.length > 0;
  const selectable = visible.filter((row) => !row.skipped && !blockedRow(row));
  const allOn = selectable.length > 0 && selectable.every((row) => row.included);
  const someOn = visible.some((row) => row.included && !blockedRow(row));
  const marked = rows.filter((row) => row.included && !blockedRow(row)).length;
  const toggleAll = () => {
    const inSight = new Set(visible.map((row) => row.line));
    const toCheck = new Set(selectable.map((row) => row.line));
    setRows((current) =>
      current.map((row) => {
        if (!inSight.has(row.line)) return row;
        if (allOn) return row.included ? { ...row, included: false, touched: true } : row;
        return toCheck.has(row.line) && !row.included
          ? { ...row, included: true, touched: true }
          : row;
      }),
    );
  };
  // What keeps the import from going, said on the button itself on the phone, where the list
  // beside it is out of sight; tapping it goes there (ADR 0060 note).
  const nothingReady =
    readyCount + ready.matches.length + ready.parts.length + ready.bills.length === 0;
  const firstToFix = rows.find((row) => row.included && check(row).problems.length > 0);
  const missing = missingDueDate
    ? { label: 'Informe o vencimento da fatura', target: 'import-due-date' }
    : missingCard
      ? {
          label: `Escolha o cartão do ${cardFunctionLabels[missingCard]}`,
          target: `import-card-${missingCard}`,
        }
      : marked === 0
        ? { label: 'Marque ao menos uma linha', target: 'import-all' }
        : nothingReady && firstToFix
          ? { label: 'Complete as linhas marcadas', target: `import-row-${firstToFix.line}` }
          : null;
  const goTo = (id: string) => {
    const target = document.getElementById(id);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus({ preventScroll: true });
  };
  // What keeps "Importar" off, together beside it.
  const blockers = [
    ...(missingDueDate ? ['Informe o vencimento da fatura.'] : []),
    ...(missingCard ? [`Escolha o cartão do ${cardFunctionLabels[missingCard]}.`] : []),
    ...(marked === 0 ? ['Marque ao menos uma linha.'] : []),
  ];
  const stats: [string, string, string?][] = [
    account
      ? ['Já no app', String(ready.matches.length + ready.parts.length + ready.bills.length)]
      : ['Prontas', `${readyCount + ready.matches.length} de ${rows.length}`],
    [account ? 'Saídas novas' : 'Saídas', formatCents(debits)],
    [
      account ? 'Entradas novas' : 'Entradas',
      credits > 0 ? `+ ${formatCents(credits)}` : formatCents(0),
      credits > 0 ? 'text-credit-foreground' : undefined,
    ],
    account
      ? ['Novos', String(ready.transactions.length)]
      : statement
        ? ['Parcelamentos novos', String(ready.plans.length)]
        : ['Com problema', String(withProblems.length)],
  ];

  return (
    <div className="grid gap-6">
      {/* The step's top: what is reviewed and "Cancelar", scrolling with the page (a band fixed on
          the phone took room from the list for a rare action; leaving by mistake asks anyway). */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance">
          {heading.title}
        </h1>
        <Button ref={cancelRef} variant="outline" size="sm" onClick={cancel}>
          Cancelar
        </Button>
      </div>
      <div className="-mt-3 grid gap-3">
        <p className="text-muted-foreground">{heading.subtitle}</p>
        <StepIndicator steps={['Arquivo', 'Revisão', 'Importado']} current={1} />
      </div>
      {/* The check before importing (ADR 0040 note): the numbers side by side, as the month's
          totals in Lançamentos, then the statement's month and due date (ADR 0055 note) and what
          tells this import apart later, each explained behind its "ⓘ". */}
      <SectionCard title="Resumo">
        {/* The live region wraps the list: on the <dl> itself it would stop being one (axe). */}
        <div role="status">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            {stats.map(([term, value, className]) => (
              <div key={term} className="grid gap-0.5">
                <dt className="text-muted-foreground text-sm">{term}</dt>
                <dd className={cn('text-lg font-semibold tabular-nums', className)}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statement && (
            <>
              <FormField
                id="import-period"
                label="Mês de referência"
                help="O mês da fatura: todas as linhas entram nele, inclusive as parcelas."
              >
                <Input
                  type="month"
                  value={statement.period}
                  onChange={(event) => {
                    if (/^\d{4}-\d{2}$/.test(event.target.value)) {
                      statement.onPeriodChange(event.target.value);
                    }
                  }}
                />
              </FormField>
              <FormField
                id="import-due-date"
                label="Vencimento da fatura"
                help="Todas as linhas vencem nesse dia, como na fatura."
                error={missingDueDate ? 'Informe o vencimento da fatura.' : undefined}
              >
                <Input
                  type="date"
                  value={statement.dueDate ?? ''}
                  onChange={(event) => statement.onDueDateChange(event.target.value || null)}
                />
              </FormField>
            </>
          )}
          <FormField
            id="import-label"
            label="Origem (opcional)"
            help='Como esta importação aparece em "Importações anteriores". Ex.: Cartão Nubank do Diego.'
          >
            <Input
              autoComplete="off"
              maxLength={100}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </FormField>
        </div>
      </SectionCard>

      {/* One card per function for the whole file (ADR 0062 note), asked only for what goes in. */}
      {askedCards.length > 0 && (
        <SectionCard
          title="Cartões"
          help="As linhas no Crédito ou no Débito vão para o cartão escolhido aqui, um para cada função. Para trocar o de uma linha só, edite o lançamento depois de importar."
        >
          <div className="grid items-start gap-4 sm:grid-cols-2">
            {askedCards.map((role) => {
              const count = cardLines[role] ?? 0;
              const what = `Para ${count === 1 ? 'a linha' : `as ${count} linhas`} no ${cardFunctionLabels[role]}.`;
              return (
                <FormField
                  key={role}
                  id={`import-card-${role}`}
                  label={`Cartão do ${cardFunctionLabels[role]}`}
                  hint={chosenCards[role] ? what : undefined}
                  error={chosenCards[role] ? undefined : `${what} Escolha qual.`}
                >
                  <CardSelect
                    cards={cards.list}
                    role={role}
                    value={chosenCards[role] ?? ''}
                    onChange={(cardId) =>
                      setPickedCards((current) => ({ ...current, [role]: cardId }))
                    }
                  />
                </FormField>
              );
            })}
          </div>
        </SectionCard>
      )}
      {statement && !statement.baseRows && <p role="status">Atualizando a revisão…</p>}
      {/* What could count twice or stay out, in the warning colors: never behind an "ⓘ". */}
      {account && found && (
        <SectionCard
          title="Conferência"
          help="Antes de importar, o app compara cada movimento com o que já está lançado. O que já está no app não entra de novo: um pendente é quitado no dia do movimento. O que não existe vira um lançamento novo."
        >
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            {(
              [
                ['Já lançados no app', found.matched],
                ...(found.settling > 0
                  ? [
                      [
                        `${found.settling === 1 ? 'Um deles está pendente e será quitado' : `${found.settling} deles estão pendentes e serão quitados`}`,
                        null,
                      ] as const,
                    ]
                  : []),
                ...(found.bills > 0 ? [['Faturas de cartão pagas', found.bills] as const] : []),
                ...(found.parts > 0
                  ? [['Recebimentos ou pagamentos parciais de empréstimos', found.parts] as const]
                  : []),
                ...(found.different > 0
                  ? [['Valor diferente, para você decidir', found.different] as const]
                  : []),
                ['Novos', found.fresh],
                ['Fora, com o motivo', found.out],
              ] as const
            ).map(([term, count]) => (
              <div key={term} className="contents">
                <dt className={count === null ? 'text-muted-foreground pl-3 text-sm' : undefined}>
                  {term}
                </dt>
                <dd className="text-right font-semibold tabular-nums">{count ?? ''}</dd>
              </div>
            ))}
          </dl>
          {account.knownCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {account.knownCount === 1
                ? 'Mais 1 movimento já importado antes, que fica de fora.'
                : `Mais ${account.knownCount} movimentos já importados antes, que ficam de fora.`}
            </p>
          )}
        </SectionCard>
      )}
      {[...(statement?.notices ?? []), ...(account?.notices ?? [])].map((notice) => (
        <p key={notice} role="note" className={NOTICE_CLASS}>
          {notice}
        </p>
      ))}

      {overlapping.length > 0 && (
        <p role="note" className={NOTICE_CLASS}>
          Você já importou lançamentos desses meses (
          {overlapping
            .map((previous) =>
              previous.firstPeriod === previous.lastPeriod
                ? formatPeriod(previous.firstPeriod)
                : `${formatPeriod(previous.firstPeriod)} a ${formatPeriod(previous.lastPeriod)}`,
            )
            .join('; ')}
          ). Importar de novo duplica os lançamentos; se quiser trocar, desfaça a importação
          anterior primeiro.
        </p>
      )}

      {unmatched.length > 0 && (
        <SectionCard
          title="Categorias novas"
          help="Categorias da planilha que não existem neste espaço. Escolha a correspondente de cada uma, ou crie com o nome da planilha: ela só é criada ao importar."
        >
          <Button
            type="button"
            variant="outline"
            className="sm:justify-self-start"
            onClick={() =>
              setMatches((current) => {
                const next = new Map(current);
                for (const entry of unmatched) next.set(entry.key, newCategoryValue(entry.name));
                return next;
              })
            }
          >
            {unmatched.length === 1
              ? `Criar “${unmatched[0]!.name}”`
              : `Criar as ${unmatched.length} com o nome da planilha`}
          </Button>
          <div className="grid gap-4 sm:grid-cols-2">
            {unmatched.map((entry) => (
              <FormField
                key={entry.key}
                id={`match-${entry.key}`}
                label={`${entry.name} (${typeLabel[entry.type]}, ${entry.rowCount} ${entry.rowCount === 1 ? 'linha' : 'linhas'})`}
              >
                <CategorySelect
                  value=""
                  onChange={(categoryId) =>
                    setMatches((current) => new Map(current).set(entry.key, categoryId))
                  }
                  options={categories.filter(
                    (category) => category.type === entry.type && !category.archived,
                  )}
                  allowAdd
                />
              </FormField>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {account ? (
          <SegmentedControl
            label="Mostrar"
            options={accountGroups}
            value={group}
            onChange={setGroup}
          />
        ) : (
          withProblems.length > 0 && (
            <SegmentedControl
              label="Mostrar"
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'problems', label: 'Com problemas' },
              ]}
              value={onlyProblems ? 'problems' : 'all'}
              onChange={(value) => setOnlyProblems(value === 'problems')}
            />
          )
        )}
        <div className="flex items-center">
          {/* A 44px target on the phone, like each row's box (ADR 0036). */}
          <label
            htmlFor="import-all"
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center md:size-8"
          >
            <Checkbox
              id="import-all"
              checked={allOn ? true : someOn ? 'indeterminate' : false}
              disabled={visible.length === 0}
              onCheckedChange={toggleAll}
              aria-describedby="import-all-count"
            />
          </label>
          <label htmlFor="import-all" className="cursor-pointer font-medium">
            Marcar todas
          </label>
          <span id="import-all-count" className="text-muted-foreground ml-3 text-sm tabular-nums">
            {marked} de {rows.length} {rows.length === 1 ? 'marcada' : 'marcadas'}
          </span>
          {statement && (
            <InfoTip term="Marcar todas">
              Marca as linhas à vista, menos as que o app desmarcou por um motivo, como o pagamento
              da fatura ou uma compra já lançada: essas você marca uma a uma. Desmarcar todas
              desmarca qualquer linha.
            </InfoTip>
          )}
          {account && (
            <InfoTip term="Marcar todas">
              Marca os movimentos à vista, menos os que o app desmarcou por um motivo, como o
              pagamento da fatura ou uma caixinha: esses você marca um a um. Desmarcar todas
              desmarca qualquer movimento. Desmarcar um já lançado quer dizer não conferir: nada é
              criado nem quitado.
            </InfoTip>
          )}
        </div>
      </div>

      {groupByPeriod(visible).map(({ period, rows: grouped }) => {
        const totals = groupTotals(grouped);
        const titleId = `import-period-${period ?? 'sem'}`;
        return (
          <section key={period ?? 'sem'} aria-labelledby={titleId} className="grid gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 id={titleId} className="font-medium first-letter:uppercase">
                {period ? formatPeriod(period) : 'Sem mês de referência válido'}
              </h2>
              <span className="text-muted-foreground text-sm tabular-nums">
                Entradas {formatCents(totals.credits)}, saídas {formatCents(totals.debits)}
              </span>
            </div>
            {/* One card per row, like Lançamentos (ADR 0036 note). */}
            <ul className={CARD_LIST}>
              {grouped.map((row) => {
                const { categoryId, problems } = check(row);
                return (
                  <RowItem
                    key={row.line}
                    row={row}
                    categoryName={nameOf(categoryId)}
                    categoryOptions={categories.filter(
                      (category) => category.type === row.type && !category.archived,
                    )}
                    problems={problems}
                    onToggle={(included) =>
                      update(row.line, (current) => ({ ...current, included, touched: true }))
                    }
                    // The same choice goes to the lines of the same title (ADR 0055 note).
                    onCategory={(chosen) =>
                      setRows((current) =>
                        applyToSameTitle(current, { ...row, categoryId: chosen, touched: true }),
                      )
                    }
                    onEdit={(trigger) => {
                      triggerRef.current = trigger;
                      setEditing(row.line);
                    }}
                    onRefuse={(matchRefused) =>
                      update(row.line, (current) => ({ ...current, matchRefused, touched: true }))
                    }
                  />
                );
              })}
            </ul>
          </section>
        );
      })}

      {(Boolean(category.error) || create.isError) && (
        <p role="alert" className="text-destructive">
          {apiErrorMessage(category.error ?? create.error)}
        </p>
      )}
      <div className="grid gap-2 md:justify-items-start">
        {/* Why "Importar" is off, together beside it; a state, so in sight. */}
        {blockers.length > 0 && (
          <div className="grid gap-1 rounded-lg border p-3">
            <p className="font-medium">Antes de importar:</p>
            <ul className="list-disc pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}
        {unmatched.length > 0 && (
          <p className="text-muted-foreground text-sm">
            {waitingForCategory === 1
              ? '1 linha espera a categoria correspondente e só entra depois de escolher uma.'
              : `${waitingForCategory} linhas esperam a categoria correspondente e só entram depois de escolher uma.`}
          </p>
        )}
        <div className="flex items-center">
          <p className="text-muted-foreground text-sm">
            {withoutMerchant > 0
              ? `${withoutMerchant} ${withoutMerchant === 1 ? 'saída' : 'saídas'} sem estabelecimento (opcional).`
              : 'Nada é enviado antes de "Importar".'}
          </p>
          <InfoTip term="Importar">
            Tudo ou nada: se algum lançamento falhar, nenhum entra. Depois, dá para desfazer a
            importação em "Importações anteriores".
          </InfoTip>
        </div>
        {/* Fixed above the tab bar on the phone, within reach of the thumb (ADR 0036). */}
        <PageActionButton
          wide
          variant={missing ? 'secondary' : 'default'}
          onClick={() => (missing ? goTo(missing.target) : void submit())}
          disabled={
            (nothingReady && !missing) ||
            (Boolean(statement) && !statement?.baseRows) ||
            category.isPending ||
            create.isPending
          }
        >
          {category.isPending || create.isPending
            ? 'Importando…'
            : missing
              ? missing.label
              : account
                ? accountButton(
                    ready.transactions.length,
                    ready.matches.length + ready.parts.length,
                    ready.bills.length,
                  )
                : readyCount === 0 && ready.matches.length > 0
                  ? `Conferir ${ready.matches.length}`
                  : `Importar ${ready.transactions.length} ${ready.transactions.length === 1 ? 'lançamento' : 'lançamentos'}${
                      ready.plans.length > 0
                        ? ` e ${ready.plans.length} ${ready.plans.length === 1 ? 'parcelamento' : 'parcelamentos'}`
                        : ''
                    }${ready.matches.length > 0 ? ` e conferir ${ready.matches.length}` : ''}`}
        </PageActionButton>
      </div>

      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar a revisão?</AlertDialogTitle>
            <AlertDialogDescription>
              As escolhas que você fez nas linhas (categorias, estabelecimentos, o que marcou ou
              desmarcou) se perdem. Nada foi importado ainda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar revisando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onChooseAnother}>
              Descartar revisão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.state === 'blocked' && blocker.reset()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da revisão?</AlertDialogTitle>
            <AlertDialogDescription>
              A revisão ainda não foi importada, e as escolhas feitas nas linhas se perdem se você
              sair agora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar revisando</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => blocker.state === 'blocked' && blocker.proceed()}
            >
              Sair sem importar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveDialog
        open={Boolean(editingRow)}
        onOpenChange={(open) => !open && setEditing(null)}
        returnFocusTo={triggerRef}
        title={`Linha ${editingRow?.line ?? ''} ${account ? 'do extrato' : statement ? 'da fatura' : 'da planilha'}`}
        description="A mudança vale só para esta importação; o arquivo não muda."
      >
        {editingRow && (
          <ImportRowForm
            row={editingRow}
            categories={categories}
            merchants={merchants}
            pendingMerchants={merchants && pendingMerchants(rows, merchants)}
            sameLines={(alias) => sameTitleCount(rows, editingRow, alias)}
            categoryId={resolveCategory(editingRow, categories, matches)}
            onSave={(fixed) => {
              // On a statement, the choices go to the other lines of the same title too.
              setRows((current) => applyToSameTitle(current, { ...fixed, touched: true }));
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
