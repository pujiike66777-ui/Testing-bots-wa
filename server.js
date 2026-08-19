import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

let sock = null;
let isConnected = false;

app.get('/', (req,res)=>{
 res.send(`
 <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
 <style>body{font-family:sans-serif;text-align:center;padding:20px} #qr img{width:300px;border:10px solid #000;border-radius:10px} .on{color:green;font-weight:bold} .off{color:red}</style>
 </head><body>
 <h1>WA BOT Kedungadem</h1>
 <div id="status" class="off">MENGHUBUNGKAN...</div>
 <div id="qr">Tunggu QR...</div>
 <script src="/socket.io/socket.io.js"></script>
 <script>
   const s=io();
   s.on('status', d=>{
     document.getElementById('status').innerHTML = d.connected ? '<span class=on>● ONLINE</span>' : '<span class=off>● OFFLINE - Scan QR</span>';
   });
   s.on('qr', url=>{
     document.getElementById('qr').innerHTML = '<img src="'+url+'"><p>Scan pakai WhatsApp</p>';
   });
 </script></body></html>
 `)
});

async function startBot(){
 const { state, saveCreds } = await useMultiFileAuthState('auth_info');
 const logger = pino({ level: 'silent' });
 sock = makeWASocket({ auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger)}, logger, printQRInTerminal:false });
 sock.ev.on('creds.update', saveCreds);
 sock.ev.on('connection.update', async (u)=>{
   const { connection, lastDisconnect, qr } = u;
   if(qr){
     const url = await QRCode.toDataURL(qr);
     io.emit('qr', url);
   }
   if(connection==='close'){
     isConnected=false; io.emit('status',{connected:false});
     if(lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
   }
   if(connection==='open'){ isConnected=true; io.emit('status',{connected:true}); }
 });
 sock.ev.on('messages.upsert', async ({messages})=>{
   for(const m of messages){
     if(!m.message || m.key.fromMe) continue;
     const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').toLowerCase();
     const from = m.key.remoteJid;
     if(text.includes('halo')) await sock.sendMessage(from, {text: 'Halo juga! Bot Kedungadem aktif 😊'});
     if(text.includes('menu')) await sock.sendMessage(from, {text: 'Menu: ketik halo, menu, jam, info'});
     if(text.includes('jam')) await sock.sendMessage(from, {text: 'Jam: '+ new Date().toLocaleString('id-ID')});
   }
 });
}
httpServer.listen(process.env.PORT||3000, ()=>startBot());
