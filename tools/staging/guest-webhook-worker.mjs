import crypto from 'node:crypto';
import webhook from '../../api/payment-webhook.js';
const raw=Buffer.from(process.argv[2]||'','base64');
const sig=crypto.createHmac('sha256',process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(raw).digest('hex');
const req={method:'POST',headers:{'x-signature':sig},
 on(name,fn){if(name==='data')fn(raw);if(name==='end')fn();return this}};
const res={status(n){this.code=n;return this;},json(body){this.body=body;return this;},
 setHeader(){return this}};
try{
 await webhook(req,res);
 process.stdout.write(String(res.code)+':'+(res.body?.duplicate?'DUP':'OK'));
 if(![200,503].includes(res.code))process.exitCode=2;
}catch{process.stdout.write('ERROR');process.exitCode=2;}
