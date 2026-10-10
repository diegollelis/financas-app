import { ACCOUNT_PATH, TERMS_PATH } from '@financas/shared';
import { Link } from 'react-router';
import { ContactLink, LegalPage, LegalSection as Section } from '@/features/legal/legal-page';

const inlineLink = 'text-primary underline';

/**
 * Public privacy policy (ADR 0012), required by Google to publish the sign-in consent screen
 * (ADR 0026). It describes only what the app really stores; update it whenever that changes.
 */
export function PrivacyPage() {
  const contact = <ContactLink />;

  return (
    <LegalPage title="Política de privacidade" updated="10 de outubro de 2026">
      <Section title="Quem somos">
        <p>
          O CodeLélis Finanças é um projeto pessoal de estudo, sem fins lucrativos, para controle
          financeiro mensal. O responsável pelos dados (controlador, na LGPD) é Diego Lélis, que
          mantém o app. O código é aberto e está em{' '}
          <a href="https://github.com/diegollelis/financas-app" className={inlineLink}>
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
            nome, e-mail e foto do perfil. Guardamos também a versão dos{' '}
            <Link to={TERMS_PATH} className={inlineLink}>
              Termos de uso
            </Link>{' '}
            que você aceitou e quando.
          </li>
          <li>
            <strong>Dados financeiros:</strong> o que você mesmo cadastra: lançamentos (com as
            descrições), categorias, orçamentos e destinos de guardar, recorrências e parcelamentos.
          </li>
          <li>
            <strong>Pessoas:</strong> o nome das pessoas que você cadastra para dividir contas ou
            registrar o que tem a receber e a pagar. Guardamos só o nome que você digitar; cadastre
            apenas o necessário para identificar a pessoa.
          </li>
          <li>
            <strong>Importações:</strong> a planilha que você importa é lida no seu próprio
            navegador e nunca chega ao servidor. Guardamos só os lançamentos que você confirmar e um
            registro da importação (quantos lançamentos e de quais meses), para você poder
            desfazê-la.
          </li>
          <li>
            <strong>Espaços e convites:</strong> quem participa de cada espaço, com o papel de cada
            um, e o e-mail das pessoas convidadas.
          </li>
          <li>
            <strong>Segurança:</strong> o endereço IP e o navegador de cada sessão, e contadores de
            tentativas por IP, que protegem contra ataques e são descartados em minutos.
          </li>
        </ul>
        <p>
          No seu navegador, usamos o cookie da sessão, indispensável para manter você conectado, e,
          no login com o Google, um cookie temporário que protege esse login. O app também guarda no
          navegador o tema que você escolheu e o último espaço aberto. Não há cookies de publicidade
          nem de análise de uso.
        </p>
      </Section>

      <Section title="Para que usamos">
        <p>
          Só para oferecer o serviço: guardar as suas informações financeiras, mostrar os painéis,
          enviar os e-mails da conta (confirmação do e-mail, aviso de cadastro repetido, redefinição
          de senha, troca de e-mail, com um aviso ao endereço antigo, exclusão da conta e convites)
          e proteger o acesso. Não vendemos dados, não exibimos anúncios e não usamos os seus dados
          para outros fins.
        </p>
        <p>
          A base legal é a execução do serviço que você contratou ao criar a conta (LGPD, art. 7º,
          V). Os registros de segurança, como IP e tentativas de login, se apoiam no legítimo
          interesse de proteger as contas e o serviço (art. 7º, IX).
        </p>
      </Section>

      <Section title="Quem mais tem acesso">
        <p>
          Os membros de um espaço veem os dados financeiros daquele espaço, conforme o papel de cada
          um, e o nome e o e-mail dos outros membros. O seu espaço pessoal é só seu.
        </p>
        <p>
          Para funcionar, o app usa estes fornecedores, que processam dados apenas em nosso nome:
          Cloudflare (site), Render (servidor), Neon (banco de dados), Resend (envio de e-mails),
          Sentry (relatórios de erro técnico, sem dados financeiros, de conta ou de sessão), GitHub
          (guarda as cópias de segurança, criptografadas, que ele não consegue ler) e Google (login,
          se você escolher essa opção). Os servidores ficam nos Estados Unidos, o que caracteriza
          transferência internacional de dados, feita para a execução do serviço que você contratou.
        </p>
      </Section>

      <Section title="Por quanto tempo">
        <p>
          Enquanto a sua conta existir. Uma sessão termina depois de 7 dias sem uso, ou quando você
          sai. Quando você exclui a conta (em Minha conta), os seus dados são apagados, junto com os
          espaços em que só você participa; um espaço seu com outras pessoas precisa ser resolvido
          antes. As cópias de segurança (backups) do banco são criptografadas e guardadas por 30
          dias; um dado apagado sai delas quando elas vencem.
        </p>
      </Section>

      <Section title="Os seus direitos">
        <p>
          Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir acesso, correção, cópia
          (portabilidade) ou exclusão dos seus dados, e saber com quem eles são compartilhados. Você
          corrige os seus dados no próprio app e baixa uma cópia deles em{' '}
          <Link to={ACCOUNT_PATH} className={inlineLink}>
            Minha conta
          </Link>
          , onde também pode excluir a conta. Para os outros pedidos, escreva para {contact}.
          Respondemos em até 15 dias.
        </p>
        <p>
          Se você foi cadastrado como pessoa na conta de outra pessoa (para dividir uma conta, por
          exemplo) e quer saber o que há sobre você ou pedir a exclusão, escreva para o mesmo
          e-mail.
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
    </LegalPage>
  );
}
