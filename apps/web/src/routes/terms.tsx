import { formatIsoDate, PRIVACY_PATH, TERMS_VERSION } from '@financas/shared';
import { Link } from 'react-router';
import { ContactLink, LegalPage, LegalSection as Section } from '@/features/legal/legal-page';

const inlineLink = 'text-primary underline';

/**
 * Public terms of use (ADR 0041). Accepted at sign-up, or on the acceptance screen; a relevant
 * change to this text needs a new TERMS_VERSION, so everyone accepts it again. Written without a
 * legal review, which the ADR still recommends.
 */
export function TermsPage() {
  const contact = <ContactLink />;

  return (
    <LegalPage title="Termos de uso" updated={formatIsoDate(TERMS_VERSION)}>
      <Section title="O que é o Finanças">
        <p>
          O Finanças é um app gratuito para organizar as finanças do mês, sozinho ou com a família.
          É um projeto pessoal de estudo, sem fins lucrativos, mantido por uma pessoa. Ao criar uma
          conta ou continuar usando o app, você concorda com estes termos e com a{' '}
          <Link to={PRIVACY_PATH} className={inlineLink}>
            Política de privacidade
          </Link>
          .
        </p>
      </Section>

      <Section title="Sua conta">
        <ul className="grid list-disc gap-1 pl-5">
          <li>Use o seu nome e um e-mail que seja seu. Cada conta é de uma pessoa.</li>
          <li>
            Guarde a sua senha e não a compartilhe. Para dar acesso a alguém, convide a pessoa para
            um espaço.
          </li>
          <li>
            Se perceber um acesso que não foi seu, troque a senha e avise pelo e-mail {contact}.
          </li>
        </ul>
      </Section>

      <Section title="Espaços compartilhados">
        <p>
          Quem convida alguém para um espaço escolhe o papel da pessoa, e ela passa a ver os dados
          daquele espaço. Convide só quem deve ver essas informações. O dono do espaço pode remover
          membros a qualquer momento.
        </p>
      </Section>

      <Section title="Uso permitido">
        <p>
          Use o app para organizar finanças pessoais ou familiares. Não é permitido usá-lo para
          atividades ilegais, tentar acessar dados de outras pessoas, explorar falhas de segurança
          (se encontrar uma, avise pelo e-mail acima) ou sobrecarregar o serviço de propósito.
        </p>
      </Section>

      <Section title="Os seus dados">
        <p>
          Os lançamentos e as informações que você cadastra são seus. Como eles são tratados está na{' '}
          <Link to={PRIVACY_PATH} className={inlineLink}>
            Política de privacidade
          </Link>
          . Você pode pedir uma cópia ou a exclusão deles a qualquer momento.
        </p>
      </Section>

      <Section title="O que o app não é">
        <p>
          O Finanças mostra os números que você lança; ele não é consultoria financeira, contábil
          nem de investimentos. Confira as informações antes de tomar decisões importantes.
        </p>
      </Section>

      <Section title="Disponibilidade">
        <p>
          O app é oferecido como está, sem garantia de funcionar sem interrupções. Fazemos cópias de
          segurança diárias, mas recomendamos guardar uma cópia própria dos dados importantes. Se o
          serviço for encerrado, você será avisado com antecedência para baixar os seus dados.
        </p>
      </Section>

      <Section title="Encerramento">
        <p>
          Você pode excluir a sua conta quando quiser. Uma conta usada contra estes termos pode ser
          suspensa, com aviso por e-mail, exceto quando for preciso agir na hora para proteger
          outras pessoas ou o serviço.
        </p>
      </Section>

      <Section title="Mudanças nestes termos">
        <p>
          Quando estes termos mudarem de forma importante, a data no topo será atualizada e você
          precisará aceitá-los de novo para continuar usando o app.
        </p>
      </Section>

      <Section title="Lei aplicável e contato">
        <p>
          Estes termos seguem as leis do Brasil, incluindo o Código de Defesa do Consumidor e a Lei
          Geral de Proteção de Dados. Dúvidas: {contact}.
        </p>
      </Section>
    </LegalPage>
  );
}
