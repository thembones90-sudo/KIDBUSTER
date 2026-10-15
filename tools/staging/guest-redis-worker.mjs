import {acquirePaymentLock} from '../../api/_lib/kv-client.js';
const key=process.argv[2],token=process.argv[3];
try { process.stdout.write((await acquirePaymentLock(key,token,75))?'WIN':'LOSE'); }
catch { process.stdout.write('ERROR');process.exitCode=2; }
