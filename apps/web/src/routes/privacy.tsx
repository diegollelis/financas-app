import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Where data subjects send their requests (LGPD, art. 18). Public on purpose (ADR 0012). */
const PRIVACY_CONTACT_EMAIL = 'financas.app.contato@gmail.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Public privacy policy (ADR 0012), required by Google to publish the sign-in consent screen
 * (ADR 0026). It describes only what the app really stores; update it whenever that changes.
 */
export function PrivacyPage() {
  const contact = (
    <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-primary underline">
      {PRIVACY_CONTACT_EMAIL}
    </a>
  );

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6 text-sm leading-relaxed">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">Política de privacidade</h1>
        <p className="text-muted-foreground">Última atualização: 4 de outubro de 2026</p>
      </header>

      <Section title="Quem somos">
        <p>
          O Finanças é um projeto pessoal de estudo, sem fins lucrativos, para controle financeiro
          mensal. O código é aberto e está em{' '}
          <a href="https://github.com/diegollelis/financas-app" className="text-primary underline">
            github.com/diegollelis/financas-app
          </a>
          . Dúvidas e pedidos sobre os seus dados: {contact}.
        </p>
      </Section>

      <Section title="Quais dados guardamos">
        <ul className="grid list-disc gap-1 pl-5">
          <li>
            <strong>Conta:</strong> nome e e-mail. A senha é guardada só de forma cifrada (hash), e
            ninguém consegue lê-la. Se você entrar com o Google, recebemos do Google apenas o seu
            nome, e-mail e foto do perfil.
          </li>
          <li>
            <strong>Dados financeiros:</strong> os lançamentos, categorias e orçamentos que você
            mesmo cadastra, incluindo as descrições.
          </li>
          <li>
            <strong>Espaços e convites:</strong> quem participa de cada espaço e o e-mail das
            pessoas convidadas.
          </li>
          <li>
            <strong>Segurança:</strong> o endereço IP e o navegador de cada sessão, e contadores de
            tentativas de login por IP, que protegem contra ataques e são descartados em minutos.
          </li>
        </ul>
        <p>
          Usamos um único cookie, o da sua sessão, que é indispensável para manter você conectado.
          Não há cookies de publicidade nem de análise de uso.
        </p>
      </Section>

      <Section title="Para que usamos">
        <p>
          Só para oferecer o serviço: guardar as suas informações financeiras, mostrar os painéis,
          enviar e-mails da conta (verificação, redefinição de senha e convites) e proteger o
          acesso. Não vendemos dados, não exibimos anúncios e não usamos os seus dados para outros
          fins.
        </p>
      </Section>

      <Section title="Quem mais tem acesso">
        <p>
          Os membros de um espaço veem os dados financeiros daquele espaço, conforme o papel de cada
          um. O seu espaço pessoal é só seu.
        </p>
        <p>
          Para funcionar, o app usa estes fornecedores, que processam dados apenas em nosso nome:
          Cloudflare (site), Render (servidor), Neon (banco de dados), Resend (envio de e-mails),
          Sentry (relatórios de erro técnico, sem dados financeiros, de conta ou de sessão) e Google
          (login, se você escolher essa opção). Os servidores ficam nos Estados Unidos, o que
          caracteriza transferência internacional de dados, feita para a execução do serviço que
          você contratou.
        </p>
      </Section>

      <Section title="Por quanto tempo">
        <p>
          Enquanto a sua conta existir. As sessões expiram em 7 dias. Quando a conta é excluída (por
          enquanto, a pedido pelo e-mail abaixo), os seus dados são apagados, junto com os espaços
          dos quais você é o único dono.
        </p>
      </Section>

      <Section title="Os seus direitos">
        <p>
          Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir acesso, correção, cópia
          (portabilidade) ou exclusão dos seus dados, e saber com quem eles são compartilhados.
          Enquanto essas opções não estão disponíveis dentro do app, faça o pedido pelo e-mail{' '}
          {contact}. Respondemos em até 15 dias.
        </p>
      </Section>

      <Section title="Segurança">
        <p>
          A conexão é sempre criptografada (HTTPS). Os dados de cada espaço ficam isolados dos
          demais, inclusive dentro do banco de dados, e os registros técnicos do sistema não guardam
          descrições, valores nem senhas.
        </p>
      </Section>

      <Section title="Mudanças nesta política">
        <p>
          Quando esta política mudar, a data no topo da página será atualizada. Mudanças importantes
          serão avisadas no app.
        </p>
      </Section>

      <footer>
        <Link to="/" className="text-primary underline-offset-4 hover:underline">
          Voltar para o Finanças
        </Link>
      </footer>
    </main>
  );
}
