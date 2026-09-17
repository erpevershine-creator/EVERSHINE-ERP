import {readTelegramToken} from './telegram-secret-store.mjs';
const token=await readTelegramToken();
const api=async(method,body)=>{const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body??{})});const j=await r.json();if(!j.ok)throw new Error(`Telegram ${method} failed`);return j.result;};
const me=await api('getMe'); const updates=await api('getUpdates',{allowed_updates:['channel_post'],limit:100});
const posts=updates.map(x=>x.channel_post).filter(Boolean); if(!posts.length) throw new Error('No channel post update found; post a new text message in the channel, then retry.');
const p=posts.at(-1), chat=p.chat; const info=await api('getChat',{chat_id:chat.id}); const admins=await api('getChatMember',{chat_id:chat.id,user_id:me.id});
if(!['administrator','creator'].includes(admins.status)||!admins.can_post_messages) throw new Error('Bot is not allowed to post in this channel');
console.log(JSON.stringify({bot:`@${me.username}`,channelId:chat.id,channelTitle:info.title,channelUsername:info.username??null,botStatus:admins.status,canPost:admins.can_post_messages},null,2));
