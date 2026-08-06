export default function handler(req, res){
  console.log("PING");
  res.status(200).json({ok:true});
}
