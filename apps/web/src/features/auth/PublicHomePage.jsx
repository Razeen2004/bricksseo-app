import { useState } from 'react';
import { Link } from 'react-router-dom';
import s from './PublicHomePage.module.css';

// Public landing page for account.bricksseo.com — shown to anyone who isn't
// logged in, instead of redirecting straight to /login. This is also the
// page that needs to satisfy a payment processor's domain review (Paddle):
// a clear product description, pricing, features, and visible links to
// Terms, Privacy and Refund policies, all on this one page.

const ARROW_RIGHT = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></svg>
);
const CHECK = (color) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);

const FEATURES = [
  {
    tag: 'PANEL', title: 'In-builder SEO panel',
    desc: "Titles, meta descriptions, canonicals and Open Graph tags, edited inside the Bricks canvas. No separate metabox.",
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h18v16H3z M3 9h18 M9 9v11" /></svg>,
    viz: (
      <div className={s.mini}>
        <div style={{ display: 'flex', gap: 16, padding: '10px 12px 0', borderBottom: '1px solid var(--line-subtle)' }}>
          <span className={s.mono} style={{ fontSize: 9.5, letterSpacing: '.06em', paddingBottom: 8, borderBottom: '2px solid var(--primary)' }}>SEO</span>
          <span className={s.mono} style={{ fontSize: 9.5, letterSpacing: '.06em', color: 'var(--faint)' }}>SCHEMA</span>
          <span className={s.mono} style={{ fontSize: 9.5, letterSpacing: '.06em', color: 'var(--faint)' }}>SOCIAL</span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className={s.mono} style={{ fontSize: 8.5, letterSpacing: '.08em', color: 'var(--faint)' }}>SEO TITLE</span>
          <div style={{ display: 'flex', justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: 3, padding: '6px 8px' }}>
            <span className={s.mono} style={{ fontSize: 10 }}>About Our Studio</span><span className={s.mono} style={{ fontSize: 8, color: 'var(--primary)' }}>56 / 60</span>
          </div>
        </div>
      </div>
    )
  },
  {
    tag: 'FALLBACK', title: 'Five-tier fallback chain',
    desc: 'Every field resolves in order, from post meta down to the WordPress default, so pages are never left without meta.',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 3 8l9 5 9-5-9-5z M3 13l9 5 9-5" /></svg>,
    viz: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div className={`${s.tier} ${s.tierOn}`}><span className={s.tokOk}>✓</span>post meta<span style={{ marginLeft: 'auto', fontSize: 8.5, color: 'var(--primary-hi)' }}>MATCH</span></div>
        <div className={s.tier}><span className={s.tokM}>–</span>bricks page settings</div>
        <div className={s.tier}><span className={s.tokM}>–</span>content-type template</div>
        <div className={s.tier}><span className={s.tokM}>–</span>site-wide template</div>
        <div className={s.tier}><span className={s.tokM}>–</span>wp core default</div>
      </div>
    )
  },
  {
    tag: 'SCHEMA', title: 'JSON-LD schema',
    desc: 'Article, Product, LocalBusiness, FAQ, HowTo, Review and CollectionPage, chosen per page to match its content.',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l-6-6 6-6 M15 6l6 6-6 6" /></svg>,
    viz: (
      <div className={s.mini}>
        <div className={s.miniRow}><span style={{ color: 'var(--faint)', fontSize: 9 }}>application/ld+json</span><span className={s.tokOk} style={{ fontSize: 9 }}>✓ valid</span></div>
        <div style={{ padding: '10px 14px 12px', font: '400 10.5px/1.85 var(--mono)', color: 'var(--muted)' }}>
          <div className={s.tokM}>{'{'}</div>
          <div style={{ paddingLeft: 14 }}><span className={s.tokK}>&quot;@type&quot;</span>: <span className={s.tokS}>&quot;Article&quot;</span>,</div>
          <div style={{ paddingLeft: 14 }}><span className={s.tokK}>&quot;breadcrumb&quot;</span>: <span className={s.tokS}>&quot;BreadcrumbList&quot;</span></div>
          <div className={s.tokM}>{'}'}</div>
        </div>
      </div>
    )
  },
  {
    tag: 'ARCHIVES', title: 'Archive & taxonomy SEO',
    desc: 'Category, tag, author and post-type archives get their own titles, descriptions, canonicals and schema.',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z" /></svg>,
    viz: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <span className={s.chip}><span className={s.tokOk}>✓</span>category</span>
          <span className={s.chip}><span className={s.tokOk}>✓</span>tag</span>
          <span className={s.chip}><span className={s.tokOk}>✓</span>author</span>
          <span className={s.chip}><span className={s.tokOk}>✓</span>post-type</span>
        </div>
        <span className={s.mono} style={{ fontSize: 9.5, letterSpacing: '.04em', color: 'var(--faint)', textAlign: 'center' }}>title · description · canonical · schema</span>
      </div>
    )
  },
  {
    tag: 'INDEXING', title: 'Sitemap, robots, redirects',
    desc: 'Cached XML sitemaps, a robots.txt editor, manual and automatic 301 redirects, and a 404 monitor.',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6h4v4H6z M14 14h4v4h-4z M14 6h4v4h-4z M8 10v4h6" /></svg>,
    viz: (
      <div className={s.mini}>
        <div className={s.miniRow}><span style={{ color: 'var(--ink)' }}>/sitemap.xml</span><span className={s.tokOk} style={{ fontSize: 9 }}>cached</span></div>
        <div className={s.miniRow}><span>robots.txt</span><span style={{ fontSize: 9, color: 'var(--primary-hi)' }}>editor</span></div>
        <div className={s.miniRow}><span>/old → /new</span><span className={s.tokS} style={{ fontSize: 9 }}>301</span></div>
        <div className={s.miniRow}><span>/missing</span><span style={{ fontSize: 9, color: 'var(--danger)' }}>404 logged</span></div>
      </div>
    )
  },
  {
    tag: 'LOCAL', title: 'Local SEO & KML',
    desc: 'LocalBusiness schema with geo coordinates and opening hours, plus a /locations.kml endpoint for maps.',
    icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12z M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /></svg>,
    viz: (
      <div className={s.mini}>
        <div className={s.miniRow}><span className={s.tokK}>@type</span><span className={s.tokS}>LocalBusiness</span></div>
        <div className={s.miniRow}><span className={s.tokK}>geo</span><span className={s.tokM}>{'{ lat, lng }'}</span></div>
        <div className={s.miniRow}><span className={s.tokK}>hours</span><span className={s.tokM}>openingHours[]</span></div>
        <div className={s.miniRow}><span className={s.tokK}>kml</span><span className={s.tokOk}>/locations.kml</span></div>
      </div>
    )
  }
];

const PLANS = [
  { code: 'solo', name: 'Solo', price: '$39', per: '/ year', sub: 'for one site', perks: ['1 site activation', 'All SEO features', 'JSON-LD schema', 'Sitemap & redirects', 'Email support'], cta: 'Get Solo', style: 'line' },
  { code: 'studio', name: 'Studio', tag: 'Most popular', price: '$89', per: '/ year', sub: 'for five sites', perks: ['5 site activations', 'Everything in Solo', 'Priority email support', 'Free minor-version upgrades'], cta: 'Get Studio', style: 'solid', featured: true },
  { code: 'agency', name: 'Agency', price: '$179', per: '/ year', sub: 'for unlimited sites', perks: ['Unlimited site activations', 'Everything in Studio', 'Priority support', 'Early access to betas'], cta: 'Get Agency', style: 'line' },
  { code: 'lifetime', name: 'Lifetime', tag: 'Launch offer · 25 only', price: '$299', per: 'one-time', sub: 'unlimited sites, forever', perks: ['Unlimited sites, forever', 'All features, forever', 'Lifetime updates', 'Lifetime support'], cta: 'Get Lifetime', style: 'line', lifetime: true }
];

const FAQS = [
  ['What exactly am I buying?', 'A license for the Bricks SEO WordPress plugin. After checkout you get a download link and a license key. Install the plugin on your WordPress site and paste the key to activate updates and support.'],
  ['How do annual plans renew?', "Solo, Studio and Agency renew automatically each year at the same price. You can turn off renewal from your account at any time. If you don't renew, the plugin keeps working; you just stop receiving updates and support."],
  ['What does "lifetime" mean?', "One payment of $299 for unlimited sites, lifetime updates and lifetime support. It's a launch offer capped at 25 customers, after which it closes."],
  ['Can I move my license to a different site?', 'Yes. Deactivate it on the old site and activate it on the new one from your account. No email needed.'],
  ['Do you offer refunds?', 'Yes. Every plan has a 14-day money-back guarantee. Email support@bricksseo.com within 14 days of purchase for a full refund. Full details are in our Refund Policy.'],
  ['Who processes my payment?', 'Paddle.com is our merchant of record. Paddle handles the checkout, invoices and any applicable sales tax or VAT, and your receipt will show Paddle.']
];

function PlusMinus({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" className="v" style={{ flexShrink: 0 }}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="12" y1="5" x2="12" y2="19" style={{ opacity: open ? 0 : 1, transition: 'opacity .15s' }} />
    </svg>
  );
}

export default function PublicHomePage() {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className={s.page}>
      <header className={s.hdr}>
        <div className={`${s.wrap} ${s.hdrIn}`}>
          <a className={s.brand} href="#top" aria-label="Bricks SEO">
            <span className={s.brandMark}><img src="/bricks-seo-sidebar-logo.png" alt="" /></span>
            <span className={s.brandTxt}><span className={s.brandName}>Bricks SEO</span><span className={s.brandSub}>account.bricksseo.com</span></span>
          </a>
          <nav className={s.hdrNav}>
            <a className={s.navA} href="#features">Features</a>
            <a className={s.navA} href="#pricing">Pricing</a>
            <a className={s.navA} href="#faq">FAQ</a>
            <a className={s.navA} href="https://bricksseo.com/refund-policy/">Refunds</a>
          </nav>
          <div className={s.hdrRight}>
            <Link className={s.navA} to="/login">Log in</Link>
            <a className={`${s.btn} ${s.btnLight}`} href="#pricing">Get Bricks SEO {ARROW_RIGHT}</a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className={s.hero}>
          <div className={s.heroGlow} />
          <div className={s.wrap} style={{ position: 'relative' }}>
            <a className={s.pill} href="#pricing">
              <span className={s.pillDot} />
              <span style={{ font: '500 12.5px var(--ui)' }}>WordPress plugin for the Bricks builder</span>
              <span className={s.pillGo}>{ARROW_RIGHT}</span>
            </a>
            <h1>SEO that lives <span className={s.mark}>inside Bricks,</span> <span className={s.ital}>not beside it.</span></h1>
            <p className={s.heroSub}>Bricks SEO is a WordPress plugin that adds a native SEO panel to the Bricks page builder. Edit titles, meta descriptions, canonicals, Open Graph tags and JSON-LD schema without leaving the canvas, with sitemaps and redirects built in. Sold as an annual or lifetime license, delivered as an instant download.</p>
            <div className={s.heroCta}>
              <a className={`${s.btn} ${s.btnSolid}`} href="#pricing">See plans — from $39/year {ARROW_RIGHT}</a>
              <a className={`${s.btn} ${s.btnLine}`} href="#features">What&apos;s included {ARROW_RIGHT}</a>
            </div>
            <div className={s.heroMeta}>
              <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 6 2 12 8 18" /><polyline points="16 6 22 12 16 18" /></svg>Works with Bricks 1.9+</span>
              <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" /></svg>14-day money-back guarantee</span>
              <span><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></svg>Secure checkout via Paddle</span>
            </div>

            <div className={`${s.frame} ${s.spec}`}>
              <div><span className="k">Product</span><span className="v">WP plugin</span></div>
              <div><span className="k">Delivery</span><span className="v">Instant download</span></div>
              <div><span className="k">License</span><span className="v">Annual / lifetime</span></div>
              <div><span className="k">Refunds</span><span className="v">14 days</span></div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className={s.sec} id="features">
          <div className={s.wrap}>
            <div className={s.shead}>
              <div className={s.sheadL}>
                <span className={s.eyebrow}>What&apos;s included</span>
                <h2 className={s.h2}>A complete SEO toolkit, <span className={s.ital}>tuned for Bricks.</span></h2>
              </div>
              <p className={s.lead}>Every plan includes every feature below. Plans differ only in how many sites you can activate.</p>
            </div>

            <div className={s.fgrid}>
              {FEATURES.map((f) => (
                <div key={f.tag} className={`${s.frame} ${s.lift} ${s.fcard}`}>
                  <div className={`${s.fviz} ${s.dots}`}>{f.viz}</div>
                  <div className={s.fbody}>
                    <span className={s.ficon}>{f.icon}</span>
                    <div className={s.ftxt}>
                      <span className={s.ftag}>{f.tag}</span>
                      <span className={s.h3}>{f.title}</span>
                      <p className={s.small}>{f.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className={s.sec} id="pricing">
          <div className={s.wrap}>
            <div className={s.shead}>
              <div className={s.sheadL}>
                <span className={s.eyebrow}>Pricing</span>
                <h2 className={s.h2}>Simple, honest, <span className={s.ital}>no surprises.</span></h2>
              </div>
              <p className={s.lead}>Prices in USD. Annual plans renew yearly and can be cancelled any time from your account.</p>
            </div>

            <div className={`${s.frame} ${s.plans}`}>
              {PLANS.map((p) => (
                <div key={p.code} className={`${s.plan} ${p.featured ? s.planFeatured : ''} ${p.lifetime ? s.planLifetime : ''}`}>
                  <div className={s.planTop}><span className={s.planName}>{p.name}</span><span className={s.planTag}>{p.tag}</span></div>
                  <div>
                    <div className={s.price}><b>{p.price}</b><span>{p.per}</span></div>
                    <p className={s.small} style={{ marginTop: 8 }}>{p.sub}</p>
                  </div>
                  <div className={s.rule} />
                  <ul className={s.perks}>
                    {p.perks.map((perk) => (
                      <li key={perk}>{CHECK(p.lifetime ? 'var(--accent)' : 'var(--primary-hi)')}{perk}</li>
                    ))}
                  </ul>
                  <Link className={`${s.btn} ${p.style === 'solid' ? s.btnSolid : s.btnLine}`} to={`/pay?plan=${p.code}`}>{p.cta}</Link>
                </div>
              ))}
            </div>

            <div className={`${s.frame} ${s.terms}`}>
              <div>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" /><polyline points="9 12 11 14 15 10" /></svg>
                <div><span className="k">14-day guarantee</span><p className={s.small}>Full refund on any plan within 14 days of purchase. <a href="https://bricksseo.com/refund-policy/" style={{ color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Refund Policy</a></p></div>
              </div>
              <div>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <div><span className="k">Secure checkout</span><p className={s.small}>Payments are processed by Paddle, our merchant of record, which handles billing and sales tax.</p></div>
              </div>
              <div>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                <div><span className="k">Instant delivery</span><p className={s.small}>Your download and license key appear in this account and by email right after payment.</p></div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className={s.sec} id="faq">
          <div className={`${s.wrap} ${s.faq}`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <span className={s.eyebrow}>FAQ</span>
              <h2 className={s.h2}>Questions, <span className={s.ital}>answered.</span></h2>
              <p className={s.lead} style={{ fontSize: 15 }}>Billing and license questions people ask before buying.</p>
            </div>
            <div className={s.faqList}>
              {FAQS.map(([q, a], i) => {
                const open = openFaq === i;
                return (
                  <div key={q} className={`${s.faqRow} ${open ? s.faqRowOpen : ''}`}>
                    <button type="button" className={s.faqQ} aria-expanded={open} onClick={() => setOpenFaq(open ? -1 : i)}>
                      <span className={s.faqN}>{String(i + 1).padStart(2, '0')}</span>
                      <span className={s.faqT}>{q}</span>
                      <PlusMinus open={open} />
                    </button>
                    {open && <div className={s.faqA}><p className={s.lead} style={{ fontSize: 15 }}>{a}</p></div>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CLOSING */}
        <section className={s.sec} style={{ padding: '96px 0' }}>
          <div className={s.wrap}>
            <div className={`${s.frame} ${s.dots} ${s.close}`}>
              <div className={s.closeGlow} />
              <span className={s.eyebrow}>Ready when you are</span>
              <h2>Stop fighting your <span className={s.mark}>SEO plugin.</span></h2>
              <p className={s.lead} style={{ maxWidth: 520, fontSize: 17 }}>One license, every feature, a 14-day guarantee.</p>
              <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                <a className={`${s.btn} ${s.btnSolid}`} href="#pricing">Choose a plan {ARROW_RIGHT}</a>
                <Link className={`${s.btn} ${s.btnLine}`} to="/login">Log in to your account</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.ftr}>
        <div className={s.wrap}>
          <div className={s.ftrGrid}>
            <div className={s.ftrCol} style={{ gap: 18 }}>
              <div className={s.brand}>
                <span className={s.brandMark} style={{ width: 30, height: 30 }}><img src="/bricks-seo-sidebar-logo.png" alt="" /></span>
                <span className={s.brandName}>Bricks SEO</span>
              </div>
              <p style={{ margin: 0, maxWidth: 260, font: "italic 400 24px/1.15 var(--display)", letterSpacing: '-0.02em', color: 'var(--muted)' }}>SEO built for Bricks, by Bricks users.</p>
            </div>
            <div className={s.ftrCol}>
              <span className={s.ftrH}>Product</span>
              <a className={s.navA} href="#features">Features</a>
              <a className={s.navA} href="#pricing">Pricing</a>
              <a className={s.navA} href="#faq">FAQ</a>
              <a className={s.navA} href="https://bricksseo.com/">bricksseo.com</a>
            </div>
            <div className={`${s.ftrCol} ${s.ftrLegal}`}>
              <span className={s.ftrH}>Legal</span>
              <a className={s.navA} href="https://bricksseo.com/terms-conditions/">Terms &amp; Conditions</a>
              <a className={s.navA} href="https://bricksseo.com/privacy-policy/">Privacy Policy</a>
              <a className={s.navA} href="https://bricksseo.com/refund-policy/">Refund Policy</a>
            </div>
            <div className={s.ftrCol}>
              <span className={s.ftrH}>Support</span>
              <a className={s.navA} href="mailto:support@bricksseo.com">Email support</a>
              <span className={s.ftrMail}>support@bricksseo.com</span>
              <span className={s.small} style={{ fontSize: 12.5 }}>Replies within one business day.</span>
            </div>
          </div>
          <div className={s.ftrBot}>
            <span>© {new Date().getFullYear()} Bricks SEO. Paddle is the merchant of record for all purchases.</span>
            <nav>
              <a href="https://bricksseo.com/terms-conditions/">Terms</a>
              <a href="https://bricksseo.com/privacy-policy/">Privacy</a>
              <a href="https://bricksseo.com/refund-policy/">Refunds</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
