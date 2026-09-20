const express = require("express");
const http = require("http");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "change-this-secret-before-production";

app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname, "public")));

const users = new Map();
const messages = [];
const requests = [];
const privateMessages = [];
let nextId = 1;

function tokenFor(user){ return jwt.sign({id:user.id}, SECRET, {expiresIn:"7d"}); }
function auth(req,res,next){
  try {
    const p = jwt.verify((req.headers.authorization||"").replace("Bearer ",""), SECRET);
    req.user = users.get(p.id);
    if (!req.user) throw new Error();
    next();
  } catch { res.status(401).json({error:"Please log in again."}); }
}
function safe(u){ return {id:u.id,name:u.name,email:u.email,pfp:u.pfp||""}; }

app.post("/api/register", async (req,res)=>{
  const {name,email,password}=req.body||{};
  if(!name || !email || !password) return res.status(400).json({error:"Please enter your name, email, and password."});
if(String(password).length < 6) return res.status(400).json({error:"Password must be at least 6 characters."});
  if([...users.values()].some(u=>u.email.toLowerCase()===email.toLowerCase())) return res.status(409).json({error:"That email is already registered."});
  const user={id:String(nextId++),name:name.trim().slice(0,40),email:email.trim(),hash:await bcrypt.hash(password,10),pfp:""};
  users.set(user.id,user);
  res.json({token:tokenFor(user),user:safe(user)});
});
app.post("/api/login", async (req,res)=>{
  const u=[...users.values()].find(x=>x.email.toLowerCase()===String(req.body.email||"").toLowerCase());
  if(!u || !(await bcrypt.compare(req.body.password||"",u.hash))) return res.status(401).json({error:"Incorrect email or password."});
  res.json({token:tokenFor(u),user:safe(u)});
});
app.get("/api/me",auth,(req,res)=>res.json(safe(req.user)));
app.patch("/api/me",auth,(req,res)=>{
  const {name,email,pfp}=req.body||{};
  if(name) req.user.name=String(name).trim().slice(0,40);
  if(email) req.user.email=String(email).trim();
  if(typeof pfp==="string" && pfp.length<1000000) req.user.pfp=pfp;
  res.json(safe(req.user));
});
app.patch("/api/password",auth,async(req,res)=>{
  if(!(await bcrypt.compare(req.body.currentPassword||"",req.user.hash))) return res.status(400).json({error:"Current password is incorrect."});
  if(!req.body.newPassword || req.body.newPassword.length<6) return res.status(400).json({error:"New password must be at least 6 characters."});
  req.user.hash=await bcrypt.hash(req.body.newPassword,10);
  res.json({ok:true});
});
app.get("/api/users",auth,(req,res)=>res.json([...users.values()].filter(u=>u.id!==req.user.id).map(safe)));
app.get("/api/requests",auth,(req,res)=>res.json(requests.filter(r=>r.to===req.user.id||r.from===req.user.id)));
app.post("/api/requests",auth,(req,res)=>{
  const to=users.get(req.body.to);
  if(!to || to.id===req.user.id) return res.status(400).json({error:"Invalid user."});
  if(requests.some(r=>(r.from===req.user.id&&r.to===to.id)||(r.from===to.id&&r.to===req.user.id))) return res.status(409).json({error:"A request already exists."});
  const r={id:String(nextId++),from:req.user.id,to:to.id,status:"pending"};
  requests.push(r); io.to("user:"+to.id).emit("request",r);
  res.json(r);
});
app.post("/api/requests/:id",auth,(req,res)=>{
  const r=requests.find(x=>x.id===req.params.id && x.to===req.user.id);
  if(!r) return res.status(404).json({error:"Request not found."});
  r.status=req.body.action==="accept"?"accepted":"declined";
  io.to("user:"+r.from).emit("request:update",r);
  res.json(r);
});
app.get("/api/private/:userId",auth,(req,res)=>{
  const ok=requests.some(r=>r.status==="accepted" && ((r.from===req.user.id&&r.to===req.params.userId)||(r.to===req.user.id&&r.from===req.params.userId)));
  if(!ok) return res.status(403).json({error:"This private chat requires an accepted request."});
  res.json(privateMessages.filter(m=>(m.from===req.user.id&&m.to===req.params.userId)||(m.to===req.user.id&&m.from===req.params.userId)));
});

io.on("connection",socket=>{
  socket.on("join",data=>{ if(data?.userId) socket.join("user:"+data.userId); });
  socket.on("global:send",data=>{
    const m={id:Date.now(),userId:String(data.userId||""),name:String(data.name||"Friend"),text:String(data.text||"").slice(0,500),at:new Date().toISOString()};
    messages.push(m); if(messages.length>200) messages.shift(); io.emit("global:new",m);
  });
  socket.on("private:send",data=>{
    const ok=requests.some(r=>r.status==="accepted"&&((r.from===String(data.from)&&r.to===String(data.to))||(r.to===String(data.from)&&r.from===String(data.to))));
    if(!ok) return;
    const m={id:Date.now(),from:String(data.from),to:String(data.to),text:String(data.text||"").slice(0,1000),at:new Date().toISOString()};
    privateMessages.push(m); io.to("user:"+m.from).to("user:"+m.to).emit("private:new",m);
  });
});
app.get("/api/global",auth,(req,res)=>res.json(messages));

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
server.listen(PORT,()=>console.log("FriendNest running on "+PORT));
