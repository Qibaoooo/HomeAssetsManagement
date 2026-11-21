// One-time Google Drive authorisation as the user:  npm run drive-auth
// Opens a browser login, receives the code on a loopback port, saves secrets/drive-token.json.
import http from 'node:http';
import { config } from './config.js';
import { DRIVE_SCOPE, hasOAuthClient, loadOAuthClient, saveDriveToken } from './drive.js';

if (!hasOAuthClient()) {
  console.error(`Missing ${config.oauthClientFile}.
Create it in Google Cloud Console (same project as the service account):
  APIs & Services > Credentials > Create credentials > OAuth client ID > Desktop app,
then download the JSON and save it at that path.`);
  process.exit(1);
}

const server = http.createServer();
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;
const redirectUri = `http://127.0.0.1:${port}`;
const oauth = loadOAuthClient(redirectUri);
const url = oauth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [DRIVE_SCOPE] });

console.log('\nOpen this URL in a browser and sign in as the Drive owner (luozhengiw@gmail.com):\n');
console.log(url, '\n');
console.log('Waiting for Google to redirect back...');

const code = await new Promise<string>((resolve, reject) => {
  server.on('request', (req, res) => {
    const u = new URL(req.url ?? '/', redirectUri);
    const c = u.searchParams.get('code');
    const err = u.searchParams.get('error');
    res.setHeader('content-type', 'text/html');
    if (c) {
      res.end('<p style="font-family:sans-serif">Home Assets: Drive access granted. You can close this tab.</p>');
      resolve(c);
    } else {
      res.end(`<p style="font-family:sans-serif">No code received${err ? `: ${err}` : ''}.</p>`);
      if (err) reject(new Error(err));
    }
  });
});
server.close();

const { tokens } = await oauth.getToken(code);
if (!tokens.refresh_token) {
  console.error('Google did not return a refresh token. Remove the app at https://myaccount.google.com/permissions and run this again.');
  process.exit(1);
}
saveDriveToken(tokens);
console.log(`Saved ${config.driveTokenFile}. Backups will go to the "${config.backupFolder}" folder in that Drive.`);
process.exit(0);
