import { initAssistant } from './assistant.js?v=1784611432079';
import { getSession, logout, loginWithGoogle, onAuthStateChange } from './auth.js?v=1784611432079';
import { checkout } from './payment.js?v=1784611432079';
import { t } from './i18n.js?v=1784611432079';

// Escape any server-provided string before it goes into innerHTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Builds the auth slot HTML and wires button events.
 * Called on initial load and again whenever session changes (popup login).
 */
function _renderAuthSlots(header, session) {
  const authSlot = header.querySelector('#nav-auth-slot');
  const mobileAuthSlot = header.querySelector('#nav-mobile-auth-slot');
  if (!authSlot) return;

  const authHTML = session
    ? `<div class="nav-auth-group">
         <button class="nav-btn-glass btn-account">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
           <span>${t('nav_account') || 'Account'}</span>
         </button>
         <button class="nav-btn-glass btn-logout nav-logout-btn">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
         </button>
       </div>`
    : `<button class="nav-btn-primary nav-login-btn">${t('nav_login') || 'Log in'}</button>`;

  authSlot.innerHTML = authHTML;
  if (mobileAuthSlot) mobileAuthSlot.innerHTML = authHTML;

  header.querySelectorAll('.nav-login-btn').forEach(b => b.addEventListener('click', loginWithGoogle));
  header.querySelectorAll('.nav-logout-btn').forEach(b => b.addEventListener('click', logout));
  header.querySelectorAll('.btn-account').forEach(b => b.addEventListener('click', () => openAccountModal(session)));
}
const AI_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
  <path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5"/>
  <circle cx="12" cy="12" r="3.4"/>
</svg>`;

const getNavItems = () => [
  { href: 'index.html',       label: t('nav_explore'),      page: 'explore' },
  { href: 'conditions.html',  label: t('nav_conditions'),   page: 'conditions' },
  { href: 'medications.html', label: t('nav_medications'),  page: 'medications' },
  { href: 'anatomy.html',     label: t('nav_anatomy') || 'Anatomy',      page: 'anatomy' },
  { href: 'quiz.html',        label: t('nav_quiz'),         page: 'quiz' }
];

export function renderChrome(activePage) {
  const header = document.getElementById('site-header');
  if (header) {
    header.innerHTML = `
      <div class="nav-inner">
        <a class="nav-brand" href="index.html">
          <img class="nav-logo" src="assets/icon.png" alt="">
          <span>Anatomy101</span>
        </a>
        <nav class="nav-links" role="navigation" aria-label="Main">
          ${getNavItems().map(it => `<a href="${it.href}" ${it.id ? `id="${it.id}"` : ''} class="${it.page === activePage ? 'active' : ''}">${it.label}</a>`).join('')}
        </nav>
        <div class="nav-right">
          <button class="nav-ai" data-ai-open aria-expanded="false" aria-controls="ai-panel">
            ${AI_ICON}<span>${t('nav_ask_ai') || 'Ask AI'}</span>
          </button>
          <div id="nav-auth-slot"></div>
          <button class="nav-burger" id="nav-burger" aria-label="Open menu" aria-expanded="false">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
      <div class="nav-mobile-menu" id="nav-mobile-menu" aria-hidden="true">
        ${getNavItems().map(it => `<a href="${it.href}" ${it.id ? `id="${it.id}-mobile"` : ''} class="${it.page === activePage ? 'active' : ''}">${it.label}</a>`).join('')}
        <button class="nav-ai" data-ai-open aria-expanded="false" aria-controls="ai-panel">
          ${AI_ICON}<span>${t('nav_ask_ai') || 'Ask AI'}</span>
        </button>
        <div id="nav-mobile-auth-slot"></div>
      </div>
    `;

    // Show "Log in" button immediately on first paint
    _renderAuthSlots(header, null);
    
    // Check real session
    getSession().then(async session => { 
      if (session) {
        _renderAuthSlots(header, session);
      }
    });

    // Re-render auth slot when GIS popup login completes (no page reload)
    onAuthStateChange((event, session) => _renderAuthSlots(header, session));

    // Burger toggle
    const burger = header.querySelector('#nav-burger');
    const mobileMenu = header.querySelector('#nav-mobile-menu');
    burger.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open);
      mobileMenu.setAttribute('aria-hidden', !open);
    });

    // Close menu when a link or the Ask AI button is clicked
    mobileMenu.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        burger.classList.remove('open');
        burger.setAttribute('aria-expanded', false);
      });
    });
  }

  const footer = document.getElementById('site-footer');
  if (footer) {
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-brand">
          <div class="nav-brand" style="margin-bottom:8px;">
            <img class="nav-logo" src="assets/icon.png" alt="">
            <span>Anatomy101</span>
          </div>
          <p>An interactive 3D atlas of the human body: toggle the skeleton, cardiovascular, nervous, muscular, organ, and skin layers, click any part to learn what it is and does, and explore the conditions and medications that touch it.</p>
        </div>
        <div class="footer-col">
          <div class="footer-heading">Product</div>
          ${getNavItems().map(it => `<a href="${it.href}">${it.label}</a>`).join('')}
        </div>
        <div class="footer-col">
          <div class="footer-heading">About</div>
          <p class="footer-note">Educational atlas built on the open Z-Anatomy model. Not a medical device — does not diagnose.</p>
        </div>
      </div>
      <div class="footer-bottom">© 2026 Anatomy101. Anatomy from Z-Anatomy (CC BY-SA 4.0).</div>
    `;
  }

  // Inject navbar styles immediately
  if (!document.getElementById('anatomy101-nav-styles')) {
    const navStyle = document.createElement('style');
    navStyle.id = 'anatomy101-nav-styles';
    navStyle.textContent = `
      .nav-auth-group { display: flex; gap: 12px; align-items: center; }
      
      /* Liquid Glass Navbar Account Button */
      .nav-btn-glass { 
        display: flex; align-items: center; gap: 8px; 
        background: rgba(255, 255, 255, 0.03); 
        color: rgba(255, 255, 255, 0.85); 
        border: 1px solid rgba(255, 255, 255, 0.08); 
        box-shadow: inset 0 0 20px rgba(255,255,255,0.02), 0 4px 12px rgba(0,0,0,0.2);
        backdrop-filter: blur(12px) saturate(160%);
        -webkit-backdrop-filter: blur(12px) saturate(160%);
        padding: 8px 18px; 
        border-radius: 99px; 
        font-size: 14px; 
        font-weight: 600; 
        cursor: pointer; 
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
      }
      .nav-btn-glass:hover { 
        background: rgba(255, 50, 50, 0.15); 
        color: #fff;
        border-color: rgba(255, 50, 50, 0.4); 
        box-shadow: inset 0 0 20px rgba(255,50,50,0.1), 0 0 20px rgba(255,50,50,0.2);
        transform: translateY(-2px) scale(1.02); 
      }
      .nav-btn-glass:active { transform: translateY(0) scale(0.98); }
      .nav-btn-glass svg { opacity: 0.8; transition: 0.3s; }
      .nav-btn-glass:hover svg { opacity: 1; transform: scale(1.1); stroke: #ff6b6b; }

      .nav-btn-glass.btn-logout { padding: 8px 12px; color: rgba(255,255,255,0.5); border-color: transparent; box-shadow: none; background: transparent; }
      .nav-btn-glass.btn-logout:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); border-color: rgba(248, 113, 113, 0.2); }
      
      .nav-btn-primary { background: linear-gradient(135deg, #0ea5e9, #8b5cf6); color: #fff; border: none; padding: 8px 20px; border-radius: 99px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.3s; box-shadow: 0 4px 16px rgba(14, 165, 233, 0.4); }
      .nav-btn-primary:hover { opacity: 1; box-shadow: 0 6px 20px rgba(139, 92, 246, 0.6); transform: translateY(-2px); }
    `;
    document.head.appendChild(navStyle);
  }

  // Biology assistant — mounts its own panel + stylesheet, wires [data-ai-open].
  initAssistant();

  if (!window._chromeI18nListenersAttached) {
    window._chromeI18nListenersAttached = true;
    window.addEventListener('anatomy101-lang-changed', () => renderChrome(activePage));
    window.addEventListener('anatomy101-i18n-ready', () => renderChrome(activePage));
  }
}

async function openAccountModal(session) {
  let modal = document.getElementById('account-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'account-modal';
    modal.innerHTML = `
      <div class="account-modal-backdrop"></div>
      <div class="account-modal-content">
        <button class="account-modal-close" aria-label="Close">×</button>
        <h2>Your Account</h2>
        <div id="account-modal-body">Loading...</div>
      </div>
    `;
    document.body.appendChild(modal);

    const style = document.createElement('style');
    style.textContent = `
      #account-modal { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; }
      .account-modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(16px); }
      .account-modal-content { 
        position: relative; 
        background: linear-gradient(145deg, rgba(30, 30, 35, 0.7), rgba(15, 15, 18, 0.9)); 
        backdrop-filter: blur(24px) saturate(200%);
        -webkit-backdrop-filter: blur(24px) saturate(200%);
        border: 1px solid rgba(255, 255, 255, 0.12); 
        padding: 40px; 
        border-radius: 24px; 
        width: 90%; 
        max-width: 420px; 
        color: #eee; 
        font-family: 'Outfit', sans-serif; 
        box-shadow: 0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1); 
        animation: modalEntrance 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }
      
      @keyframes modalEntrance {
        from { opacity: 0; transform: translateY(20px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .account-modal-close { position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.05); border: none; color: #999; font-size: 20px; width: 36px; height: 36px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease; }
      .account-modal-close:hover { background: rgba(255, 100, 100, 0.2); color: #ff8a8a; transform: rotate(90deg) scale(1.1); }
      
      .account-modal-content h2 { margin-top: 0; margin-bottom: 32px; font-size: 28px; font-weight: 700; text-align: center; color: #fff; letter-spacing: -0.5px; }
      
      /* Stale Free Tier vs Premium Upgrades */
      .acc-stat { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.03); margin-bottom: 12px; border-radius: 14px; transition: 0.3s; }
      .acc-stat:hover { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08); }
      .acc-stat span:first-child { color: rgba(255,255,255,0.6); font-size: 14.5px; font-weight: 500; }
      .acc-stat span:last-child { color: #fff; font-size: 15px; font-weight: 600; font-family: monospace; }
      
      .acc-stat span.acc-badge { font-family: inherit; background: rgba(255, 255, 255, 0.05); color: rgba(255,255,255,0.4); padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border: 1px solid rgba(255, 255, 255, 0.08); text-shadow: none; box-shadow: none; }
      
      .acc-stat span.acc-badge.pro { 
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2)); 
        color: #f472b6; 
        border: 1px solid rgba(236, 72, 153, 0.4); 
        box-shadow: 0 0 15px rgba(236, 72, 153, 0.3);
        text-shadow: 0 0 10px rgba(236, 72, 153, 0.5);
      }
      
      .acc-stat span.acc-badge.plus { 
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(56, 189, 248, 0.2)); 
        color: #7dd3fc; 
        border: 1px solid rgba(14, 165, 233, 0.4);
        box-shadow: 0 0 15px rgba(14, 165, 233, 0.3);
      }
      
      .acc-upgrade { margin-top: 32px; display: flex; gap: 16px; flex-direction: column; }
      
      .acc-upgrade button { 
        position: relative; overflow: hidden;
        background: rgba(255,255,255,0.03); 
        color: rgba(255,255,255,0.9); 
        border: 1px solid rgba(255,255,255,0.1); 
        padding: 18px 24px; 
        border-radius: 16px; 
        font-weight: 700; 
        font-size: 16px;
        cursor: pointer; 
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); 
        display: flex; justify-content: space-between; align-items: center; 
      }
      
      .acc-upgrade button.btn-plus {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(14, 165, 233, 0.05));
        border: 1px solid rgba(14, 165, 233, 0.3);
      }
      .acc-upgrade button.btn-plus:hover {
        background: linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(14, 165, 233, 0.1));
        border-color: rgba(14, 165, 233, 0.6);
        box-shadow: 0 10px 30px rgba(14, 165, 233, 0.2);
        transform: translateY(-2px);
      }
      
      .acc-upgrade button.btn-pro { 
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2)); 
        border: 1px solid rgba(236, 72, 153, 0.4); 
        color: #fff;
        box-shadow: 0 8px 25px rgba(139, 92, 246, 0.15);
      }
      .acc-upgrade button.btn-pro::before {
        content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
        transform: skewX(-20deg); transition: 0.5s;
      }
      .acc-upgrade button.btn-pro:hover::before { left: 150%; }
      .acc-upgrade button.btn-pro:hover { 
        box-shadow: 0 15px 40px rgba(236, 72, 153, 0.35); 
        transform: translateY(-3px) scale(1.02);
        border-color: rgba(236, 72, 153, 0.8);
      }
      
      .upgrade-price { opacity: 0.9; font-size: 15px; font-weight: 800; letter-spacing: 0.5px; background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 8px; }
    `;
    document.head.appendChild(style);

    modal.querySelector('.account-modal-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.account-modal-backdrop').addEventListener('click', () => modal.remove());
  }

  try {
    const res = await fetch('/api/user/me', { headers: { 'Authorization': `Bearer ${session.access_token}` } });
    if (!res.ok) throw new Error('Failed to load stats');
    const data = await res.json();
    
    const body = modal.querySelector('#account-modal-body');
    body.innerHTML = `
      <div class="acc-stat">
        <span>Current Tier</span>
        <span class="acc-badge ${esc(data.tier)}">${esc(data.tier)}</span>
      </div>
      <div class="acc-stat">
        <span>Daily AI Messages</span>
        <span>${data.messagesAllowed > 9000 ? 'Unlimited' : `${data.messagesUsed} / ${data.messagesAllowed}`}</span>
      </div>
      <div class="acc-stat">
        <span>Weekly Quizzes</span>
        <span>${data.quizzesAllowedThisWeek > 9000 ? 'Unlimited' : `${data.quizzesUsedThisWeek} / ${data.quizzesAllowedThisWeek}`}</span>
      </div>
      ${data.tier !== 'pro' ? `
        <div class="acc-upgrade">
          ${data.tier === 'free' ? `<button class="btn-plus"><span>Upgrade to Plus</span><span class="upgrade-price">₹50</span></button>` : ''}
          <button class="btn-pro"><span>Upgrade to Pro</span><span class="upgrade-price">₹150</span></button>
        </div>
      ` : ''}
    `;

    const btnPlus = body.querySelector('.btn-plus');
    const btnPro = body.querySelector('.btn-pro');
    if (btnPlus) btnPlus.addEventListener('click', () => { modal.remove(); checkout('plus'); });
    if (btnPro) btnPro.addEventListener('click', () => { modal.remove(); checkout('pro'); });

  } catch (err) {
    modal.querySelector('#account-modal-body').innerHTML = '<p style="color:red">Error loading account data.</p>';
  }
}
