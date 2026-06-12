
export const makeCss = (C) => `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;}
  body{background:${C.bg};}
  .nav:hover{background:${C.navHover};}
  .mod:hover{color:${C.text};}
  .frow:hover{background:${C.rowHover};}
  .trow{border-top:1px solid ${C.line};}
  .trow:hover{background:${C.rowHover};}
  .locHead:hover{background:${C.rowHover};}
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
  .pctIn:focus,.amtIn:focus{border-color:${C.green};}
  .itemRow:hover{background:${C.rowHover};}
  .locBody > div:last-child{border-bottom:none;}
  .stockList > div:last-child{border-bottom:none;}
  .exp:hover{color:${C.text};}
  .mb:hover{filter:brightness(1.3);}
  .btn:hover{filter:brightness(1.08);}
  .btn:active{transform:scale(0.95);}
  .btn{transition:transform .08s ease, filter .15s ease;}
  .reqAct{transition:transform .1s ease, background .15s ease, color .15s ease;}
  .reqActB:active{transform:scale(0.88);}
  @keyframes spin{to{transform:rotate(360deg);}}
  .spin{display:inline-flex;animation:spin .6s linear infinite;}
  @keyframes popIn{0%{transform:scale(0.6);opacity:0;}60%{transform:scale(1.12);}100%{transform:scale(1);opacity:1;}}
  .pop{display:inline-block;animation:popIn .35s cubic-bezier(.34,1.56,.64,1);}
  @keyframes flash{0%{background:${C.green}33;}100%{background:transparent;}}
  .flashRow{animation:flash .8s ease;}
  @keyframes pulseDot{0%,100%{opacity:1;}50%{opacity:.4;}}
  .ava:hover{filter:brightness(1.1);}
  .pmi:hover{background:${C.menuHover};}
  .weekOpt:hover{background:${C.menuHover};}
  input::placeholder{color:${C.faint};}
  .fin:focus{border-color:${C.green};}
  input[type=date]{color-scheme:${C.scheme};}
  input[type=checkbox]{accent-color:${C.green};width:15px;height:15px;cursor:pointer;}
  @media (max-width: 880px){
    .fpActions{flex-direction:column;align-items:stretch;}
    .fpActions .fpBtn{justify-content:center;width:100%;}
    .fpActions .fpLink{margin-left:0;justify-content:center;}
    .heroTitle{font-size:21px;}
  }
`;
