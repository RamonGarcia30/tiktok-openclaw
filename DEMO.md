# Demonstrador local

Este demonstrador usa Login Kit + Content Posting API para publicação direta de carrosséis com 10 fotos e de vídeos (`video.publish`). As fotos precisam estar em URLs HTTPS públicas dentro do prefixo verificado no TikTok. Vídeos são enviados localmente ao TikTok com upload em partes.

## Configuração

1. Copie `.env.example` para `.env`.
2. Preencha `TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET` com as credenciais da seção **Credentials** do aplicativo TikTok.
3. No Login Kit, cadastre exatamente este Redirect URI:

   `http://localhost:3000/auth/tiktok/callback`

4. No terminal, execute:

   ```bash
   npm start
   ```

5. Abra `http://localhost:3000` e conecte a conta.
6. Para fotos, informe 10 URLs públicas e confirme a publicação; para vídeos, selecione um arquivo MP4, MOV ou WebM e confirme o envio.

O token fica em `.data/tiktok-token.json`, que está no `.gitignore` e não deve ser enviado ao GitHub.
