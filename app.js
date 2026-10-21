// Government Form Helper frontend. Replace Firebase config and payment instructions before launch.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, addDoc, setDoc, updateDoc, serverTimestamp, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const CONFIG = {
  // Firebase Console > Project settings > Your apps. Do not put service-account keys here.
  apiKey: "PASTE_FIREBASE_WEB_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  appId: "PASTE_FIREBASE_APP_ID"
};
const PAYMENT = {
  upiId: "YOUR-UPI-ID@BANK",
  payeeName: "Government Form Helper",
  qrImageUrl: "", // Optional HTTPS image URL of your UPI QR. Never use an untrusted upload URL.
  instructions: "Apne UPI app se payment karein. Reference/UTR note karein. Admin verification ke baad membership activate hogi."
};
const DEMO_VACANCIES = [
 {title:"SSC / Clerical vacancies",department:"SSC",category:"CENTRAL GOVERNMENT",qualification:"Notification ke anusar",age:"Official notice dekhein",lastDate:"Official site par verify karein",status:"Example listing",description:"Yeh sample card hai, current vacancy claim nahi. Official SSC notification verify karein.",url:"https://ssc.gov.in/"},
 {title:"Railway recruitment",department:"Railway",category:"RAILWAY",qualification:"Post ke anusar",age:"Official notice dekhein",lastDate:"Official site par verify karein",status:"Example listing",description:"Post, age limit, fees aur dates official RRB notification se verify karein.",url:"https://www.rrbapply.gov.in/"},
 {title:"UP state recruitment",department:"Uttar Pradesh",category:"STATE GOVERNMENT",qualification:"Notification ke anusar",age:"Official notice dekhein",lastDate:"Official site par verify karein",status:"Example listing",description:"UP recruitment ke liye official department notice aur application portal check karein.",url:"https://uppsc.up.nic.in/"}
];
const DEFAULT_PLANS = [
 {id:"basic",name:"Starter",price:49,period:"month",description:"Basic guidance for getting started.",features:["Vacancy information guide","Eligibility checklist","Document checklist"],popular:false},
 {id:"plus",name:"Plus",price:99,period:"month",description:"More guidance for active applicants.",features:["Everything in Starter","Priority guidance requests","Application process walkthrough"],popular:true},
 {id:"pro",name:"Support",price:199,period:"month",description:"Extra assistance for multiple applications.",features:["Everything in Plus","Multiple application guidance","Priority support"],popular:false}
];
const $ = id => document.getElementById(id);
let app=null, auth=null, db=null, currentUser=null, isAdmin=false, authMode="login", vacancies=DEMO_VACANCIES, plans=DEFAULT_PLANS;
const configured = !CONFIG.apiKey.startsWith("PASTE_") && !CONFIG.projectId.startsWith("PASTE_") && !CONFIG.appId.startsWith("PASTE_");
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3500)}
function safeText(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function money(n){return "₹"+Number(n).toLocaleString("en-IN")}
function validHttpsUrl(url){try{const u=new URL(url);return u.protocol==="https:"?u.href:"#"}catch{return "#"}}
function renderVacancies(){
 const q=$("vacancySearch").value.toLowerCase().trim();
 const items=vacancies.filter(v=>[v.title,v.department,v.category,v.qualification].join(" ").toLowerCase().includes(q));
 $("vacancyGrid").innerHTML=items.map(v=>`<article class="vacancy-card"><span class="tag">${safeText(v.category||"VACANCY UPDATE")}</span><h3>${safeText(v.title)}</h3><p>${safeText(v.description||"Official notification check karein.")}</p><div class="vacancy-meta"><div><small>Qualification</small><b>${safeText(v.qualification||"Official notice")}</b></div><div><small>Last date</small><b>${safeText(v.lastDate||"Verify officially")}</b></div></div><a class="btn btn-light" href="${validHttpsUrl(v.url||"")}" target="_blank" rel="noopener noreferrer">Official website ↗</a></article>`).join("");
 $("emptyVacancies").classList.toggle("hidden",items.length>0);
}
function renderPlans(){
 $("planGrid").innerHTML=plans.map(p=>`<article class="plan-card ${p.popular?"featured":""}">${p.popular?'<span class="popular">POPULAR</span>':""}<h3>${safeText(p.name)}</h3><div class="price">${money(p.price)}<small> / month</small></div><p>${safeText(p.description||"Membership assistance plan.")}</p><ul>${(p.features||[]).map(f=>`<li>${safeText(f)}</li>`).join("")}</ul><button class="btn ${p.popular?"btn-primary":"btn-light"}" data-plan="${safeText(p.id)}">Choose plan</button></article>`).join("");
 document.querySelectorAll("[data-plan]").forEach(b=>b.addEventListener("click",()=>startCheckout(plans.find(p=>p.id===b.dataset.plan))));
}
async function loadPublicData(){
 if(!db){renderVacancies();renderPlans();return}
 try{
  const vs=await getDocs(collection(db,"vacancies"));
  if(!vs.empty) vacancies=vs.docs.map(d=>({id:d.id,...d.data()}));
  const ps=await getDocs(collection(db,"plans"));
  if(!ps.empty) plans=ps.docs.map(d=>({id:d.id,...d.data()}));
 }catch(e){console.warn("Could not load Firestore public data",e);toast("Live data load nahi hua; sample listings dikh rahi hain.")}
 renderVacancies();renderPlans();
}
function showAuth(){authMode="login";updateAuthMode();$("authDialog").showModal()}
function updateAuthMode(){$("authTitle").textContent=authMode==="login"?"Login":"Create account";$("authSubmit").textContent=authMode==="login"?"Login":"Create account";$("authToggle").textContent=authMode==="login"?"New here? Create account":"Already registered? Login"}
$("loginOpen").addEventListener("click",()=>currentUser?showAccount():showAuth());
function showAccount(){
 const dialog=$("checkoutDialog");$("checkoutTitle").textContent="Your account";
 $("checkoutContent").innerHTML=`<p>Signed in as <b>${safeText(currentUser?.email||"")}</b></p><p>${isAdmin?"Admin access enabled. Admin tools can be added through the secure Firestore rules and a trusted backend.":"Membership status and assistance requests can be reviewed here when configured."}</p><button id="logoutBtn" class="btn btn-light full">Logout</button>${isAdmin?'<div class="admin-area"><b>Admin account detected</b><p>Public website has no public editing controls. Manage listings through a secured admin workflow; never rely only on hiding buttons.</p><button id="seedBtn" class="btn btn-light">Seed example plans in database</button></div>':""}`;
 dialog.showModal();
 $("logoutBtn").onclick=async()=>{if(auth)await signOut(auth);dialog.close();toast("Logged out")};
 if(isAdmin&&db)$("seedBtn").onclick=async()=>{try{for(const p of DEFAULT_PLANS)await setDoc(doc(db,"plans",p.id),p,{merge:true});toast("Plans saved");await loadPublicData()}catch(e){toast("Save failed: "+e.message)}};
}
$("authToggle").addEventListener("click",()=>{authMode=authMode==="login"?"signup":"login";updateAuthMode()});
$("authForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!auth){toast("Firebase setup pending hai. README mein setup steps dekhein.");return}
 const email=$("authEmail").value.trim(), password=$("authPassword").value;
 try{
  if(authMode==="signup"){await createUserWithEmailAndPassword(auth,email,password);toast("Account created")}
  else{await signInWithEmailAndPassword(auth,email,password);toast("Login successful")}
  $("authDialog").close();
 }catch(err){toast(err.code?.includes("email-already")?"Email already registered.":err.code?.includes("invalid-credential")?"Email ya password check karein.":err.message)}
});
function startCheckout(plan){
 if(!plan)return;
 $("checkoutTitle").textContent=plan.name+" — membership";
 const qr=PAYMENT.qrImageUrl&&PAYMENT.qrImageUrl.startsWith("https://")?`<img src="${safeText(PAYMENT.qrImageUrl)}" alt="UPI QR code" style="display:block;max-width:180px;max-height:180px;object-fit:contain;margin:12px auto">`:"";
 $("checkoutContent").innerHTML=`<p>Plan: <b>${safeText(plan.name)}</b> · <b>${money(plan.price)}/month</b></p><div class="checkout-box"><b>UPI payment instructions</b><p>${safeText(PAYMENT.instructions)}</p>${qr}<p>UPI ID: <code>${safeText(PAYMENT.upiId)}</code></p><p>Payee: ${safeText(PAYMENT.payeeName)}</p><button id="copyUpi" class="btn btn-light">Copy UPI ID</button></div><form id="paymentClaim"><label>UPI transaction reference / UTR<input id="utr" required minlength="6" maxlength="40" placeholder="Enter transaction reference"></label><label>Paid amount (₹)<input id="paidAmount" type="number" min="1" required value="${Number(plan.price)}"></label><button class="btn btn-primary full">Submit for verification</button></form><p class="fine">Submitting a claim does not activate your membership. Admin must independently verify the payment. Never submit your UPI PIN, OTP, card PIN or banking password.</p>`;
 $("checkoutDialog").showModal();
 $("copyUpi").onclick=async()=>{try{await navigator.clipboard.writeText(PAYMENT.upiId);toast("UPI ID copied")}catch{toast("UPI ID: "+PAYMENT.upiId)}};
 $("paymentClaim").onsubmit=async e=>{
  e.preventDefault();
  if(!currentUser){toast("Payment claim ke liye pehle login karein.");$("checkoutDialog").close();showAuth();return}
  if(!db){toast("Firebase configure hone ke baad claim submit hoga.");return}
  const utr=$("utr").value.trim(), amount=Number($("paidAmount").value);
  if(!/^[A-Za-z0-9-]{6,40}$/.test(utr)||amount!==Number(plan.price)){toast("Transaction reference ya amount check karein.");return}
  try{
   await addDoc(collection(db,"paymentClaims"),{uid:currentUser.uid,email:currentUser.email,planId:plan.id,planName:plan.name,amount,utr,period:"month",status:"pending",createdAt:serverTimestamp()});
   toast("Claim submitted. Verification pending.");$("checkoutDialog").close();
  }catch(err){toast("Submit failed. Rules/config check karein.")}
 };
}
$("vacancySearch").addEventListener("input",renderVacancies);
$("checkEligibility").addEventListener("click",()=>{
 const age=Number($("age").value), qual=$("qualification").value, sector=$("sector").value;
 if(!$("age").value||!qual||!sector||age<0||age>100){toast("Age, qualification aur interest area fill karein.");return}
 let note="Aapki details save nahi ki gayi. Exact eligibility official notification ki age cut-off date, category relaxation, qualification aur post-specific rules par depend karti hai.";
 let heading="Official notification se verify karein";
 if(age<18)note="Kai recruitments ke liye minimum age 18 hoti hai, lekin rules post ke hisaab se badalte hain. Apni selected vacancy ki notification verify karein. "+note;
 else if(qual==="10th pass")note="10th pass qualification kuch posts ke liye relevant ho sakti hai, par har vacancy ke liye nahi. "+note;
 else note="Aapki selected qualification kuch recruitment categories mein relevant ho sakti hai. "+note;
 $("eligibilityResult").innerHTML=`<span class="result-icon">i</span><h3>${heading}</h3><p>${safeText(note)}</p><p style="margin-top:12px"><b>Interest:</b> ${safeText(sector)} · <b>Qualification:</b> ${safeText(qual)} · <b>Age:</b> ${age}</p>`;
});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
$("year").textContent=new Date().getFullYear();
if(configured){
 try{
  app=initializeApp(CONFIG);auth=getAuth(app);db=getFirestore(app);
  onAuthStateChanged(auth,async user=>{
   currentUser=user;isAdmin=false;
   if(user){
    try{const p=await getDoc(doc(db,"users",user.uid));isAdmin=p.exists()&&p.data().role==="admin"}catch{}
    $("loginOpen").textContent=isAdmin?"Admin account":"My account";
   }else $("loginOpen").textContent="Login";
  });
 }catch(e){console.error(e);toast("Firebase initialization failed. Check config.")}
}else{
 $("loginOpen").addEventListener("click",()=>toast("Firebase config add karne ke liye README follow karein."));
}
loadPublicData();
