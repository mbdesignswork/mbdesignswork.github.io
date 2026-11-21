const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const readPage = (file) => readFileSync(path.join(root, file), 'utf8');
const textOf = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const home = readPage('index.html');
const services = Array.from(home.matchAll(/<article class="service-card">([\s\S]*?)<\/article>/g), (match) => match[1]);
const starters = services.filter((card) => card.includes('class="credit-label"'));

test('the hourly card and all seven starter services quote the new-client minimum', () => {
  const hourly = home.match(/<article[^>]*aria-labelledby="hourly-rate-heading"[^>]*>([\s\S]*?)<\/article>/)[1];
  assert.match(textOf(hourly), /CAD \$75 \/ hour New-client rate/);
  assert.match(textOf(hourly), /CAD \$150 for 2 hours Prepaid minimum/);
  assert.match(textOf(hourly), /minimum 2-hour top-up at the agreed rate/);
  assert.equal(starters.length, 7);
  for (const card of starters) {
    assert.match(textOf(card), /CAD \$150 Initial 2-hour credit/);
    assert.match(card, /class="[^"]*service-pay-btn[^"]*" href="#contact"/);
  }
});

test('search engines receive the approved new-client hourly unit and prepaid minimum in CAD', () => {
  const graph = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const business = graph.find((node) => node['@type'] === 'Organization');
  const offer = graph.find((node) => node['@id'] === business.makesOffer['@id']);
  assert.match(offer.name, /new clients/i);
  assert.equal(offer.priceSpecification.priceCurrency, 'CAD');
  assert.equal(offer.priceSpecification.price, 75);
  assert.deepEqual(offer.priceSpecification.referenceQuantity, { '@type': 'QuantitativeValue', value: 1, unitCode: 'HUR' });
  assert.equal(offer.eligibleQuantity.minValue, 2);
  assert.match(offer.description, /Existing clients keep their individually agreed rates/);
});

test('fixed services and monthly design support retain their separate prices', () => {
  const fixedServices = services.filter((card) => !starters.includes(card));
  assert.equal(fixedServices.length, 2);
  for (const card of fixedServices) assert.match(textOf(card), /CAD \$150/);
  assert.match(textOf(home), /CAD \$750 \/ month 10 hours of reserved capacity each month/);
});

test('monthly inquiry emails quote the same CAD amount as the plan', () => {
  const inquiryLinks = Array.from(home.matchAll(/href="(mailto:[^"]+)">Discuss monthly support/g));
  assert.equal(inquiryLinks.length, 2);
  for (const [, href] of inquiryLinks) {
    const body = new URL(href.replaceAll('&amp;', '&')).searchParams.get('body');
    assert.ok(body.includes('CAD $750/month for 10 hours'));
  }
});

test('public hourly inquiries go through agreement and only approved monthly enrollment has a Stripe link', () => {
  assert.match(textOf(home), /individually agreed hourly rate continues to apply unless we explicitly agree/);
  assert.match(textOf(home), /payment link supplied for your approved scope or invoice/);
  const stripeLinks = Array.from(home.matchAll(/<a\b[^>]*href="https:\/\/buy\.stripe\.com\/[^"]+"[^>]*>([\s\S]*?)<\/a>/g));
  assert.deepEqual(stripeLinks.map((link) => textOf(link[1])), ['Approved clients: activate subscription']);
});

for (const service of ['pcb-design', 'electronics-prototyping', 'embedded-firmware', 'legacy-pcb-recreation', 'cad-enclosures-fixtures']) {
  test(service + ' shows CAD prices and protects agreed rates', () => {
    const page = readPage(path.join(service, 'index.html'));
    assert.match(textOf(page), /New-client hourly rate CAD \$75\/hour Initial prepaid credit for new clients CAD \$150 for 2 hours/);
    assert.match(textOf(page), /Monthly design support CAD \$750 for 10 hours/);
    assert.match(textOf(page), /Existing clients keep their individually agreed rates/);
    assert.match(page, /href="\/#contact">Request a project quote/);
    assert.doesNotMatch(page, /buy\.stripe\.com/);
  });
}
