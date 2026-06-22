(() => {

const PASSWORDS = [
  "KasperCalc",
  "admin",
  "ParkerORing2026",
  "AllenAircraft",
  "SAE_SPEC_TOOL"
];

const STORAGE_KEY = "pageUnlocked";

const style = document.createElement("style");
style.textContent = `
body.pw-locked{
  overflow:hidden;
}

body.pw-locked>*:not(#pw-overlay){
  filter:blur(12px);
  pointer-events:none;
  user-select:none;
}

#pw-overlay{
  position:fixed;
  inset:0;

  background:rgba(255,255,255,.25);
  backdrop-filter:blur(8px);

  display:flex;
  justify-content:center;
  align-items:center;

  z-index:999999;
}

#pw-box{
  width:320px;

  background:white;
  border-radius:16px;

  padding:28px;

  box-shadow:
    0 10px 50px rgba(0,0,0,.25);

  text-align:center;
}

#pw-box input{
  width:100%;
  padding:10px;
  margin-top:12px;
}

#pw-box button{
  width:100%;
  margin-top:12px;
  padding:10px;
}

#pw-error{
  margin-top:12px;
  color:#d00;
}
`;

document.head.appendChild(style);

function unlock() {
  const val =
    document.getElementById("pw-input")
      .value
      .trim();

  if (PASSWORDS.includes(val)) {

    sessionStorage.setItem(
      STORAGE_KEY,
      "true"
    );

    document.body.classList.remove(
      "pw-locked"
    );

    document
      .getElementById("pw-overlay")
      ?.remove();

  } else {

    document
      .getElementById("pw-error")
      .textContent =
      "Incorrect password";
  }
}

function buildOverlay() {

  if (
    sessionStorage.getItem(
      STORAGE_KEY
    ) === "true"
  ) return;

  document.body.classList.add(
    "pw-locked"
  );

  const overlay =
document.createElement("div");

overlay.id = "pw-overlay";

overlay.innerHTML = `
<div id="pw-box">
<h2>Restricted Page</h2>

<p>Enter password</p>

<input
id="pw-input"
type="password"
autocomplete="off"
>

<button id="pw-btn">
Enter
</button>

<div id="pw-error"></div>

</div>
`;

document.body.appendChild(
  overlay
);

document
.getElementById("pw-btn")
.addEventListener(
  "click",
  unlock
);

document
.getElementById("pw-input")
.addEventListener(
  "keydown",
  e=>{
    if(e.key==="Enter")
      unlock();
  }
);

}

if (
document.readyState ===
"loading"
) {
document.addEventListener(
"DOMContentLoaded",
buildOverlay
);
} else {
buildOverlay();
}

})();