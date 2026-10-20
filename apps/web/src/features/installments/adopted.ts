/**
 * Said when a series made from a transaction that existed before ("Tornar recorrente", "Tornar
 * parcelado") is ended or deleted: that transaction stays, launched once (ADR 0038 note).
 */
export const ADOPTED_NOTE =
  'O lançamento que já existia antes continua, como avulso, se ainda estiver pendente.';

/** The description, with the note when the series adopted a transaction. */
export const withAdoptedNote = (description: string, adoptedTransactionId: string | null) =>
  adoptedTransactionId ? `${description} ${ADOPTED_NOTE}` : description;
