
const API="http://localhost:4000";

// LOAD CROPS
async function loadCrops(){
  let res=await fetch(API+"/api/crops");
  let data=await res.json();
  let sel=document.getElementById("cropSelect");
  sel.innerHTML=data.crops.map(c=>`<option>${c}</option>`).join("");
}
loadCrops();

// LOAD DISEASES
async function loadDiseases(){
  let crop=document.getElementById("cropSelect").value;
  let res=await fetch(`${API}/api/diseases/${crop}`);
  let data=await res.json();
  let div=document.getElementById("diseaseList");
  div.innerHTML=data.diseases.map(d=>`
    <div>
      <img src="${API}${d.image}">
      <p><b>${d.name}</b></p>
    </div>
  `).join("");
}

// DETECT
async function detectImage(){
  let file=document.getElementById("fileInput").files[0];
  let fd=new FormData();
  fd.append("image", file);
  let res=await fetch(API+"/api/detect",{method:"POST",body:fd});
  let data=await res.json();
  document.getElementById("detectResult").innerText=JSON.stringify(data,null,2);
}
