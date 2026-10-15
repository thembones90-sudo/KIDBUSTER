import {getLicense} from '../../api/_lib/licensing.js';
import {claimManualLicenseForInstallation} from '../../api/_lib/license-service.js';
const [key,id]=process.argv.slice(2);
try{
 const license=await getLicense(key);
 const outcome=await claimManualLicenseForInstallation(key,license,id);
 process.stdout.write(outcome.allowed?'WIN':outcome.reason==='key_already_claimed'?'LOSE':'ERROR');
 if(!outcome.allowed && outcome.reason!=='key_already_claimed')process.exitCode=2;
}catch{process.stdout.write('ERROR');process.exitCode=2;}
