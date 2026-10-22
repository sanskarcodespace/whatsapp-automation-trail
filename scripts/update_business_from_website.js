const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const updatedSettings = {
  services: `Amolik Group — NCR's Address of Distinction. Premier real estate developer in Faridabad, Delhi NCR since 2015. 10+ years of excellence, 5M+ sq. ft. developed, 8+ signature projects, 1500+ families served.

RESIDENTIAL GROUP HOUSING (FLATS):

1. Amolik Heights — Sector 88, Faridabad
   Type: High-rise residential apartments (1 BHK, 2 BHK, 3 BHK)
   Status: Completed / Handed Over
   Prices: 1 BHK ₹46-49L | 2 BHK ₹62.78-63.42L | 3 BHK ₹70L
   Amenities: Gated society, 24/7 security, power backup, lifts, clubhouse

2. Amolik Park — Sector 88, Faridabad
   Type: Residential group housing community
   Status: Ongoing (Under Construction)
   Prices: 1 BHK from ~₹30L | 3 BHK ~₹65L
   Note: Modern amenities, thoughtfully designed community

3. Amolik Sankalp — Sector 85, Faridabad
   Type: High-rise residential apartments (1 BHK, 3 BHK)
   Status: Completed
   Prices: 1 BHK ₹40-42.59L | 3 BHK ₹80.29L

4. Amolik Residency — Sector 86, Faridabad
   Type: Residential group housing / independent floors
   Status: Completed
   Prices: 3 BHK independent floors from ₹1.50 Cr

5. Aarvista — Sector 86, Faridabad
   Type: Senior living / retirement community
   Status: Ongoing
   Note: Comfortable retirement community designed for senior living

PLOTTED RESIDENTIAL DEVELOPMENTS:

6. Neoliv Golf One — Sector 98 & 99A, Faridabad
   Type: Premium golf-themed residential plotted community
   Status: Ongoing
   Note: Luxury plotted development with golf course lifestyle

7. Amolik Concordia Living — Sector 97, Faridabad
   Type: Residential plotted township
   Status: Ongoing
   Plots: 538 to 3039+ sq.ft, starting ~₹69.97L

8. Amolik Concordia Living-I & Extension — Sector 97, Faridabad
   Type: Premium residential plotted extension
   Status: Ongoing

9. Amolik Blossom Woods — Sector 97, Faridabad
   Type: Nature-inspired residential plotted development
   Status: Ongoing

10. Amolik Aster Woods — Sector 98, Faridabad
    Type: Premium residential plotted community
    Status: Completed

11. 107th Avenue — Sector 107, Faridabad
    Type: Exclusive plotted residential development
    Status: Ongoing

UPCOMING RESIDENTIAL PROJECTS:
12. 109A/110A — Sector 109A/110A, Faridabad (25-acre plotted development, Upcoming)
13. Sector-98 — Faridabad (Premium plotted, Upcoming)
14. Sector 109 — Faridabad (Premium plotted, Upcoming)

COMMERCIAL & RETAIL (SCO & MALLS):

15. Amolik Plaza 81 — Sector 81, Faridabad
    Type: Premium commercial SCO development
    Status: Ongoing

16. Amolik Vibrant 82 — Sector 82, Faridabad
    Type: Modern commercial SCO (retail & office spaces)
    Status: Completed

17. Amolik Plaza 88 — Sector 88, Faridabad
    Type: Contemporary SCO commercial destination
    Status: Ongoing

18. City Life Mall — Sector 85, Faridabad
    Type: Integrated commercial mall (shopping & lifestyle)
    Status: Completed

UPCOMING COMMERCIAL:
19. Sector 79 Commercial & Hotel — Sector 79, Faridabad (Upcoming hospitality & commercial hub)

INDUSTRIAL & INSTITUTIONAL:
20. Amolik Business Park — NIT Faridabad (Completed industrial/business park)
21. DPS School — Sector 98, Faridabad (Upcoming CBSE co-educational school)
22. Sohna Property — Sohna, Gurugram (Upcoming industrial development)

SERVICES:
- Residential property sales (flats & independent floors)
- Plotted residential land sales
- Commercial SCO & retail space sales
- Senior living community
- Property information and project comparisons
- Budget-based property recommendations
- Site visit scheduling (owner/consultant confirms)
- Sales agent callback requests
- RERA and documentation assistance through human representative
- Home loan information referrals`,

  prices: `AMOLIK HOUSING — COMPLETE PRICE LIST (from amolik.com)

RESIDENTIAL FLATS:

1. Amolik Heights (Sector 88) — COMPLETED
   • 1 BHK: ₹46.10L – ₹49.20L
   • 2 BHK: ₹62.78L – ₹63.42L
   • 3 BHK: ₹70L
   Amenities: Gated society, 24/7 security, power backup, lifts, clubhouse

2. Amolik Park (Sector 88) — ONGOING
   • 1 BHK: from ~₹30L – ₹33.86L
   • 3 BHK: ~₹65L

3. Amolik Sankalp (Sector 85) — COMPLETED
   • 1 BHK: ₹40L – ₹42.59L
   • 3 BHK: ₹80.29L

4. Amolik Residency (Sector 86) — COMPLETED
   • 3 BHK Independent Floors: from ₹1.50 Cr

5. Aarvista Senior Living (Sector 86) — ONGOING
   • Pricing: Contact sales team

PLOTTED DEVELOPMENTS:

6. Amolik Concordia Living (Sector 97) — ONGOING
   • Plots: 538 to 3039+ sq.ft
   • Starting: ~₹69.97L

7. Amolik Concordia Living-I (Sector 97) — ONGOING
   • Pricing: Contact sales team

8. Amolik Blossom Woods (Sector 97) — ONGOING
   • Pricing: Contact sales team

9. Neoliv Golf One (Sector 98 & 99A) — ONGOING
   • Premium golf-themed plots — pricing on request

10. 107th Avenue (Sector 107) — ONGOING
    • Pricing: Contact sales team

COMMERCIAL:

11. Amolik Plaza 81 (Sector 81) — ONGOING SCO
12. Amolik Vibrant 82 (Sector 82) — COMPLETED SCO
13. Amolik Plaza 88 (Sector 88) — ONGOING SCO
14. City Life Mall (Sector 85) — COMPLETED Mall

Commercial pricing available on request from sales team.

NOTE: All prices are indicative advertised/listing prices. Exact floor, facing, availability, and final quotation are confirmed by the owner/sales team during visit.`,

  faqs: `Q: What is Amolik Group?
A: Amolik Group is a premier real estate developer in Faridabad, Delhi NCR, established in 2015. They have developed 5M+ sq. ft. across 8+ signature projects and are home to 1500+ families.

Q: Where are Amolik projects located?
A: Projects are located across Faridabad — Sector 81, 82, 85, 86, 88, 97, 98, 99A, 107, 109, and NIT Faridabad. They also have an upcoming industrial project in Sohna, Gurugram.

Q: What is the cheapest flat available?
A: Amolik Park (Sector 88) offers 1 BHK flats starting from approximately ₹30 lakh. Exact pricing requires confirmation from the sales team.

Q: Do you have 2 BHK flats?
A: Yes! Amolik Heights (Sector 88) has 2 BHK flats priced approximately ₹62.78–63.42 lakh.

Q: Do you have 3 BHK options?
A: Yes! Multiple options — Amolik Park (₹65L), Amolik Heights (₹70L), Amolik Sankalp (₹80.29L), and Amolik Residency independent floors (₹1.50 Cr).

Q: I have a ₹40 lakh budget. What can I buy?
A: You can consider a 1 BHK at Amolik Park (~₹30-33.86L) or Amolik Sankalp (~₹40-42.59L). Would you prefer Sector 88 or Sector 85?

Q: Do you have residential plots?
A: Yes! Concordia Living (Sector 97), Concordia Living-I (Sector 97), Blossom Woods (Sector 97), Neoliv Golf One (Sector 98 & 99A), 107th Avenue (Sector 107), and Aster Woods (Sector 98).

Q: What is the starting plot price?
A: Concordia Living plots start around ₹69.97 lakh (538 to 3000+ sq.ft). Other project pricing is available on request.

Q: Are properties ready to move in?
A: Amolik Heights (Sector 88), Amolik Sankalp (Sector 85), Amolik Residency (Sector 86), Amolik Vibrant 82, and Aster Woods are all completed/handed over. Other projects are ongoing.

Q: What is Neoliv Golf One?
A: It's a premium golf-themed residential plotted community in Sector 98 & 99A, Faridabad — Amolik's luxury plotted development. Currently ongoing.

Q: What is Aarvista?
A: Aarvista is a senior living / retirement community in Sector 86, Faridabad, designed for comfortable retirement living. Currently ongoing.

Q: Do you have commercial properties?
A: Yes! Amolik Plaza 81 (Sector 81), Amolik Plaza 88 (Sector 88) are ongoing SCO developments. Amolik Vibrant 82 and City Life Mall (Sector 85) are completed.

Q: Are the projects RERA registered?
A: Most projects are RERA registered. Our consultant can confirm the specific RERA registration number for your chosen project.

Q: Can I schedule a site visit?
A: Absolutely! Tell us which project interests you, and your preferred date and time. Our consultant will call to confirm the visit slot.

Q: Is there any brokerage?
A: Some listings are zero brokerage. The sales team can confirm terms for your chosen property.

Q: Where is Amolik's office?
A: Head Office: 14/3, Main Mathura Road, Near Mewla Maharajpur Metro Station, Faridabad 121003. Sales Office: Plaza 81, near DPS School, Sector 81, Faridabad 121002.

Q: What are the office hours?
A: Monday to Saturday, 10:00 AM to 6:00 PM.

Q: How to contact Amolik?
A: Phone: +91 98107 600 32 | Email: info@amolik.com / sales@amolik.com | Website: www.amolik.com`,

  opening_hours: "Monday – Saturday: 10:00 AM – 6:00 PM",

  contact_details: `Developer: Amolik Group — The Address of Distinction
Website: www.amolik.com
Head Office: 14/3, Main Mathura Road, Near Mewla Maharajpur Metro Station, Faridabad 121003
Sales Office: Plaza 81, near DPS School, Sector 81, Faridabad, Haryana 121002
Phone: +91 98107 600 32
Email: info@amolik.com / sales@amolik.com
Social Media:
  Facebook: facebook.com/amolikgroup/
  Instagram: instagram.com/amolikgroupofficial/
  LinkedIn: linkedin.com/company/amolik-group/`,

  ai_tone: "Warm, natural, conversational, polite, helpful, and human-like Indian sales assistant. Speaks fluent conversational Hinglish/Hindi or English. Represents Amolik Group with pride and premium positioning.",

  owner_name: "Sanskar Sharma",
  owner_phone: "917250307422",

  handoff_message: "Thank you for your interest! 😊 I'll forward your request to our property consultant, who can help you with the latest availability, exact pricing, and site visit details. Our team will get back to you as soon as possible.",
};

async function updateBusiness() {
  console.log('Updating Amolik Housing business record with verified website data...');

  const { data, error } = await supabase
    .from('businesses')
    .update({ settings: updatedSettings, name: 'Amolik Group' })
    .eq('phone_number_id', '1383698251495317')
    .select('id, name');

  if (error) {
    console.error('ERROR:', error);
    return;
  }

  console.log('✅ Updated successfully:', data);
  console.log('\nSettings fields updated:');
  console.log('  - services: ' + updatedSettings.services.split('\n').length + ' lines');
  console.log('  - prices: ' + updatedSettings.prices.split('\n').length + ' lines');
  console.log('  - faqs: ' + updatedSettings.faqs.split('\n').length + ' lines');
  console.log('  - opening_hours: ' + updatedSettings.opening_hours);
  console.log('  - contact_details: updated with both offices');
  console.log('  - ai_tone: updated');
  console.log('  - owner_name: ' + updatedSettings.owner_name);
  console.log('  - handoff_message: updated');
}

updateBusiness();
