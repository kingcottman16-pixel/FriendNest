const app=document.getElementById("app");let token=localStorage.getItem("fn_token"),me=null,socket=null,users=[];

const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function toast(x){
  let d=document.createElement("div");
  d.className="toast";
  d.textContent=x;
  document.body.appendChild(d);
  setTimeout(()=>d.remove(),2600)
}

async function api(url,opt={}){
  opt.headers={...(opt.headers||{}),...(token?{Authorization:"Bearer "+token}:{})};
  if(opt.body&&typeof opt.body!=="string"){
    opt.headers["Content-Type"]="application/json";
    opt.body=JSON.stringify(opt.body)
  }
  let r=await fetch(url,opt),d=await r.json();
  if(!r.ok)throw Error(d.error||"Something went wrong");
  return d
}

function auth(){
  app.innerHTML=`<div class="screen splash"><div class="card">
  <div class="logo">FN</div>
  <h1>Welcome to FriendNest</h1>
  <p class="tag">A place to connect, talk, create, and help each other.</p>
  <div class="row">
  <button class="primary" onclick="showLogin()">Log in</button>
  <button onclick="showSignup()">Create account</button>
  </div></div></div>`
}

function showLogin(){form(false)}
function showSignup(){form(true)}

function form(sign){
  app.innerHTML=`<div class="screen"><div class="card">
  <div class="logo">FN</div>
  <h2>${sign?"Create your FriendNest account":"Welcome back"}</h2>
  <form onsubmit="submitAuth(event,${sign})">
  ${sign?'<input id="name" placeholder="Name" required>':""}
  <input id="email" type="email" placeholder="Email" required>
  <input id="password" type="password" placeholder="Password" required>
  <button class="primary" style="width:100%">${sign?"Create account":"Log in"}</button>
  </form>
  <button class="ghost" style="margin-top:10px" onclick="auth()">Back</button>
  </div></div>`
}

async function submitAuth(e,sign){
  e.preventDefault();

  try{
    const emailInput=document.getElementById("email");
    const passwordInput=document.getElementById("password");
    const nameInput=document.getElementById("name");

    const email=emailInput.value.trim();
    const password=passwordInput.value;
    const name=sign ? nameInput.value.trim() : undefined;

    if(sign && !name){
      toast("Please enter your name.");
      return;
    }

    if(!email){
      toast("Please enter your email.");
      return;
    }

    if(!password){
      toast("Please enter your password.");
      return;
    }

    if(password.length<6){
      toast("Password must be at least 6 characters.");
      return;
    }

    let d=await api(
      sign?"/api/register":"/api/login",
      {
        method:"POST",
        body:{
          name:name,
          email:email,
          password:password
        }
      }
    );

    token=d.token;
    localStorage.setItem("fn_token",token);
    me=d.user;
    home()

  }catch(e){
    toast(e.message)
  }
}

async function home(){
  try{
    me=await api("/api/me")
  }catch{
    localStorage.removeItem("fn_token");
    token=null;
    return auth()
  }

  app.innerHTML=`<div class="app">
  <header class="top">
  <div class="brand">FriendNest</div>
  <div class="row">
  <button onclick="settings()">Settings</button>
  <button onclick="logout()">Log out</button>
  </div>
  </header>

  <main class="layout">
  <aside class="panel">
  <h2>Hello, ${esc(me.name)} 👋</h2>
  <p class="tag">You’re not alone here.</p>
  <button class="primary" onclick="help()">Help & support</button>
  <button class="ghost" style="margin-top:8px;width:100%" onclick="settings()">Account settings</button>
  <h3>People</h3>
  <div id="people">Loading...</div>
  </aside>

  <section class="panel chat">
  <div class="row" style="justify-content:space-between">
  <h2>Global Chat</h2>
  <button onclick="document.querySelector('.chat').requestFullscreen()">Full Chat</button>
  </div>

  <div id="msgs" class="msgs"></div>

  <div class="composer">
  <input id="chatInput" maxlength="500" placeholder="Say something kind...">
  <button class="primary" onclick="sendGlobal()">Send</button>
  </div>
  </section>
  </main>
  </div>`;

  socket=io();
  socket.emit("join",{userId:me.id});
  socket.on("global:new",renderMsg);
  socket.on("request",()=>toast("You received a message request."));
  socket.on("private:new",()=>{});

  loadGlobal();
  loadPeople();

  if(new Date().toDateString()!==localStorage.fn_day){
    localStorage.fn_day=new Date().toDateString();
    setTimeout(()=>toast([
      "You matter.",
      "Take a breath—you’ve got this.",
      "Small steps still count.",
      "Be kind to yourself today."
    ][new Date().getDate()%4]),1000)
  }
}

async function loadGlobal(){
  let ms=await api("/api/global");
  document.getElementById("msgs").innerHTML="";
  ms.forEach(renderMsg)
}

function renderMsg(m){
  const box=document.getElementById("msgs");
  if(!box)return;

  const key=m.id || `${m.name}|${m.text}|${m.createdAt||""}`;

  if(box.querySelector(`[data-msg-id="${CSS.escape(String(key))}"]`))return;

  let d=document.createElement("div");
  d.className="msg";
  d.dataset.msgId=key;
  d.innerHTML=`<b>${esc(m.name)}</b><div>${esc(m.text)}</div>`;
  box.appendChild(d);
  box.scrollTop=box.scrollHeight;
}
  let d=document.createElement("div");
  d.className="msg";
  d.innerHTML=`<b>${esc(m.name)}</b><div>${esc(m.text)}</div>`;
  document.getElementById("msgs")?.appendChild(d);
  let x=document.getElementById("msgs");
  if(x)x.scrollTop=x.scrollHeight
}

function sendGlobal(){
  let x=document.getElementById("chatInput").value.trim();
  if(!x)return;
  socket.emit("global:send",{userId:me.id,name:me.name,text:x});
  document.getElementById("chatInput").value=""
}

async function loadPeople(){
  users=await api("/api/users");
  let box=document.getElementById("people");

  box.innerHTML=users.map(u=>`
  <div class="profile">
  <div class="pfp">${u.pfp?`<img class="pfp" src="${u.pfp}">`:esc(u.name[0]||"?")}</div>
  <div style="flex:1">
  <b>${esc(u.name)}</b><br>
  <small class="tag">FriendNest member</small>
  </div>
  <button onclick="request('${u.id}')">Message</button>
  </div>
  `).join("")||"<p class='tag'>No other members yet.</p>"
}

async function request(id){
  try{
    await api("/api/requests",{method:"POST",body:{to:id}});
    toast("Message request sent.")
  }catch(e){
    toast(e.message)
  }
}

function settings(){
  app.innerHTML=`<div class="screen"><div class="card">
  <div class="logo">FN</div>
  <h2>Account settings</h2>
  <input id="newName" value="${esc(me.name)}" placeholder="Name">
  <input id="newEmail" value="${esc(me.email)}" placeholder="Email">
  <button class="primary" onclick="saveSettings()">Save profile</button>

  <hr style="border-color:#17301f;margin:24px 0">

  <h3>Change password</h3>
  <input id="cur" type="password" placeholder="Current password">
  <input id="nw" type="password" placeholder="New password">
  <button onclick="changePw()">Change password</button>

  <br>
  <button class="ghost" style="margin-top:18px" onclick="home()">Back</button>
  </div></div>`
}

async function saveSettings(){
  try{
    me=await api("/api/me",{
      method:"PATCH",
      body:{
        name:document.getElementById("newName").value,
        email:document.getElementById("newEmail").value
      }
    });
    toast("Profile saved.");
    home()
  }catch(e){
    toast(e.message)
  }
}

async function changePw(){
  try{
    await api("/api/password",{
      method:"PATCH",
      body:{
        currentPassword:document.getElementById("cur").value,
        newPassword:document.getElementById("nw").value
      }
    });
    toast("Password changed.")
  }catch(e){
    toast(e.message)
  }
}

function help(){
  app.innerHTML=`<div class="screen"><div class="card">
  <div class="logo">FN</div>
  <h2>Help & support</h2>
  <p class="tag">If you’re in immediate danger, contact your local emergency service.</p>
  <p><b>United States:</b> <a href="tel:911" style="color:#b9ffd0">911</a></p>
  <p><b>U.S. mental health crisis support:</b> <a href="tel:988" style="color:#b9ffd0">988</a></p>
  <p class="tag">Choose your region in a future update for localized resources.</p>
  <button class="ghost" onclick="home()">Back</button>
  </div></div>`
}

function logout(){
  localStorage.removeItem("fn_token");
  token=null;
  if(socket)socket.disconnect();
  auth()
}

if(token)home();else auth();
