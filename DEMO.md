# Demonstrador local

Este demonstrador usa Login Kit + Content Posting API para publicação direta de fotos (`video.publish`). As imagens precisam estar em uma URL HTTPS pública dentro do prefixo verificado no TikTok.

## Configuração

1. Copie `.env.example` para `.env`.
2. Preencha `TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET` com as credenciais da seção **Credentials** do aplicativo TikTok.
3. No Login Kit, cadastre exatamente este Redirect URI:

   `http://localhost:3000/auth/tiktok/callback`

4. No terminal, execute:

   ```bash
   npm start
   ```

5. Abra `http://localhost:3000`, conecte a conta, informe a URL pública da imagem e publique.

O token fica em `.data/tiktok-token.json`, que está no `.gitignore` e não deve ser enviado ao GitHub.
