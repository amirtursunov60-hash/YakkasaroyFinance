
export const makeCss = (C) => `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;}
  /* Фон-градиент фиксируем во вьюпорте через ::before. background-attachment:fixed
     на iOS/WebKit (Safari, Яндекс) часто не отрисовывается — верх страницы белеет
     и браузер красит статус-бар в белый. Фон и на html — как сплошной фолбэк. */
  html{background:${C.pageGrad};}
  body{background:${C.pageGrad};}
  body::before{content:"";position:fixed;inset:0;background:${C.pageGrad};z-index:-1;pointer-events:none;}
  /* viewport-fit=cover заводит контент под статус-бар (так полоса становится в цвет
     приложения). Сдвигаем шапку вниз на высоту статус-бара. !important — перебить
     инлайн height/padding. constant() — фолбэк для старых WebKit. */
  .appTop{
    padding-top: constant(safe-area-inset-top) !important;
    padding-top: env(safe-area-inset-top) !important;
    height: calc(60px + constant(safe-area-inset-top)) !important;
    height: calc(60px + env(safe-area-inset-top)) !important;
  }
  .nav:hover{background:${C.navHover};}
  .mod:hover{color:${C.text};}
  .frow:hover{background:${C.rowHover};}
  .trow{border-top:1px solid ${C.line};}
  .trow:hover{background:${C.rowHover};}
  .locHead:hover{background:${C.rowHover};}
  .locCard,.ordCard,.tableCard,.fundCard{transition:transform .25s cubic-bezier(.22,.61,.36,1), box-shadow .25s ease, border-color .25s ease;}
  @media (hover:hover){ .ordCard:hover,.tableCard:hover,.fundCard:hover{transform:translateY(-3px);} }
  input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
  .pctIn:focus,.amtIn:focus{border-color:${C.green};}
  .itemRow:hover{background:${C.rowHover};}
  .locBody > div:last-child{border-bottom:none;}
  .stockList > div:last-child{border-bottom:none;}
  .exp:hover{color:${C.text};}
  .mb:hover{filter:brightness(1.3);}
  .btn:hover{filter:brightness(1.08);}
  .glassG:hover{filter:none !important;}
  .glassG{will-change:transform;}
  .btn:not(.glass):active{transform:scale(0.95);}
  .btn{transition:transform .08s ease, filter .15s ease;}
  /* Liquid Glass кнопки: грань, свечение, живое нажатие */
  .glass{position:relative;overflow:hidden;transition:transform .12s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, filter .2s ease !important;}
  .glass::after{content:"";position:absolute;left:0;right:0;bottom:-70%;height:90%;background:radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, transparent 70%);opacity:0;transition:opacity .25s ease;pointer-events:none;}
  .glass:hover{filter:brightness(1.06);}
  .glass:active{transform:translateY(2px) scale(0.96) !important;box-shadow:inset 0 3px 8px rgba(0,0,0,0.25) !important;}
  .glass:active::after{opacity:1;}
  .glassG{transition:transform .1s ease !important;}
  .glassG:active{transform:translateY(1px) scale(0.97) !important;}
  .reqAct{transition:transform .1s ease, background .15s ease, color .15s ease;}
  .reqActB:active{transform:scale(0.88);}
  @keyframes spin{to{transform:rotate(360deg);}}
  .spin{display:inline-flex;animation:spin .6s linear infinite;}
  @keyframes popIn{0%{transform:scale(0.6);opacity:0;}60%{transform:scale(1.12);}100%{transform:scale(1);opacity:1;}}
  .pop{display:inline-block;animation:popIn .35s cubic-bezier(.16,1,.3,1);}
  @keyframes flash{0%{background:${C.green}33;}100%{background:transparent;}}
  .flashRow{animation:flash .8s ease;}
  /* Тряска кнопки при ошибке (например, нехватка средств в фонде) */
  @keyframes shakeX{0%,100%{transform:translateX(0);}15%{transform:translateX(-6px);}30%{transform:translateX(6px);}45%{transform:translateX(-5px);}60%{transform:translateX(5px);}75%{transform:translateX(-3px);}90%{transform:translateX(3px);}}
  .shake{animation:shakeX .5s cubic-bezier(.36,.07,.19,.97);}
  @keyframes pulseDot{0%,100%{opacity:1;}50%{opacity:.4;}}
  .ava:hover{filter:brightness(1.1);}
  .pmi:hover{background:${C.menuHover};}
  .weekOpt:hover{background:${C.menuHover};}
  .capItem:hover{background:${C.menuHover};}
  input::placeholder{color:${C.faint};}
  .fin:focus{border-color:${C.green};}
  input[type=date]{color-scheme:${C.scheme};}
  input[type=checkbox]{accent-color:${C.green};width:15px;height:15px;cursor:pointer;}
  svg.lucide, svg[class*="lucide"]{stroke-width:1.75px;}
  /* Денежные суммы — моноширинные tabular-цифры (читаемость финансовых данных) */
  .denseNum{font-family:${C.mono};font-variant-numeric:tabular-nums;letter-spacing:-0.01em;}
  /* Анимация появления контента при смене раздела */
  @keyframes contentIn{0%{opacity:0;transform:translateY(10px);}100%{opacity:1;transform:translateY(0);}}
  main{animation:contentIn .45s cubic-bezier(.22,.61,.36,1);}
  /* Раскрытие капсулы профиля из аватара */
  @keyframes capsuleGrow{0%{opacity:0;transform:scale(0.12);}55%{opacity:1;}100%{opacity:1;transform:scale(1);}}
  .capsuleIn{animation:capsuleGrow .38s cubic-bezier(.16,1,.3,1);}
  /* Каскадное появление элементов списков/карточек при загрузке данных */
  @keyframes riseIn{0%{opacity:0;transform:translateY(8px);}100%{opacity:1;transform:translateY(0);}}
  .riseIn{animation:riseIn .42s cubic-bezier(.16,1,.3,1) both;}
  .stagger>*{animation:riseIn .42s cubic-bezier(.16,1,.3,1) both;}
  .stagger>*:nth-child(1){animation-delay:.03s;}
  .stagger>*:nth-child(2){animation-delay:.06s;}
  .stagger>*:nth-child(3){animation-delay:.09s;}
  .stagger>*:nth-child(4){animation-delay:.12s;}
  .stagger>*:nth-child(5){animation-delay:.15s;}
  .stagger>*:nth-child(6){animation-delay:.18s;}
  .stagger>*:nth-child(7){animation-delay:.21s;}
  .stagger>*:nth-child(8){animation-delay:.24s;}
  .stagger>*:nth-child(n+9){animation-delay:.27s;}
  @media (prefers-reduced-motion: reduce){ main{animation:none;} .pop,.spin,.flashRow,.capsuleIn,.shake{animation:none;} .riseIn,.stagger>*{animation:none;} }
  /* Единое фокус-кольцо для навигации с клавиатуры (доступность) */
  button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{
    outline:2px solid ${C.green}!important;outline-offset:2px;border-radius:4px;
  }
  @media (max-width: 880px){
    .fpActions{flex-direction:column;align-items:stretch;}
    .fpActions .fpBtn{justify-content:center;width:100%;}
    .fpActions .fpLink{margin-left:0;justify-content:center;}
    .heroTitle{font-size:21px;}
  }
`;
