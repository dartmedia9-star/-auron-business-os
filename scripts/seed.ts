import { db } from "../lib/db/src/index.ts";
import {
  clientsTable, eventsTable, eventRevenueTable, eventCostsTable,
  leadsTable, marketingChannelsTable, marketingSpendTable,
  operatingExpensesTable, vendorsTable, assetsTable, employeesTable,
  valuationScenariosTable, notificationsTable, companySettingsTable,
  auditLogsTable,
} from "../lib/db/src/schema/index.ts";

const now = new Date();
const yr = now.getFullYear();

async function main() {
  console.log("Seeding database...");

  // Company settings
  await db.insert(companySettingsTable).values({
    companyName: "Auron Event Productions",
    country: "India",
    currency: "INR",
    gstNumber: "32AABCA1234A1ZR",
    gstRate: "18",
    excellentMarginThreshold: "35",
    healthyMarginThreshold: "20",
    warningMarginThreshold: "10",
    ltvCacTarget: "5",
    cacTarget: "15000",
    valuationTarget: "900000000",
  }).onConflictDoNothing();

  // Employees
  const [emp1] = await db.insert(employeesTable).values({ name: "Arjun Nair", role: "CEO & Founder", department: "Leadership", salary: "250000", joiningDate: "2018-06-01", responsibilities: "Overall strategy, business development, key client relationships", isActive: true }).returning();
  const [emp2] = await db.insert(employeesTable).values({ name: "Priya Menon", role: "Head of Operations", department: "Operations", salary: "85000", joiningDate: "2019-03-15", responsibilities: "Event execution, vendor management, logistics", isActive: true }).returning();
  const [emp3] = await db.insert(employeesTable).values({ name: "Rahul Krishnan", role: "Senior Sales Manager", department: "Sales", salary: "70000", joiningDate: "2020-01-10", responsibilities: "Lead conversion, client proposals, pipeline management", isActive: true }).returning();
  const [emp4] = await db.insert(employeesTable).values({ name: "Divya Pillai", role: "Creative Director", department: "Creative", salary: "75000", joiningDate: "2020-08-20", responsibilities: "Event design, decor concepts, stage production", isActive: true }).returning();
  const [emp5] = await db.insert(employeesTable).values({ name: "Sanjay Kumar", role: "Finance Manager", department: "Finance", salary: "65000", joiningDate: "2021-02-01", responsibilities: "P&L management, vendor payments, financial reporting", isActive: true }).returning();
  const [emp6] = await db.insert(employeesTable).values({ name: "Anjali Varma", role: "Junior Sales Executive", department: "Sales", salary: "35000", joiningDate: "2022-06-01", responsibilities: "Lead qualification, follow-ups, social media outreach", isActive: true }).returning();

  // Vendors
  const [v1] = await db.insert(vendorsTable).values({ name: "Kerala Sound & Light", category: "AV & Lighting", contactPerson: "Manoj Shetty", phone: "9876543210", email: "manoj@kslight.com", location: "Kochi", rating: 5, paymentTerms: "Net 30" }).returning();
  const [v2] = await db.insert(vendorsTable).values({ name: "Bloom Florists", category: "Decor & Florals", contactPerson: "Rekha Thomas", phone: "9876543211", location: "Thrissur", rating: 5, paymentTerms: "50% advance" }).returning();
  const [v3] = await db.insert(vendorsTable).values({ name: "Spice Garden Catering", category: "Catering", contactPerson: "Ahmed Faiz", phone: "9876543212", location: "Kozhikode", rating: 4, paymentTerms: "Net 15" }).returning();
  const [v4] = await db.insert(vendorsTable).values({ name: "Frame Perfect Photography", category: "Photography & Video", contactPerson: "Arun Babu", phone: "9876543213", location: "Kochi", rating: 5, paymentTerms: "Full payment before event" }).returning();
  const [v5] = await db.insert(vendorsTable).values({ name: "Carnival Tent House", category: "Tent & Furniture", contactPerson: "Suresh Nambiar", phone: "9876543214", location: "Palakkad", rating: 4, paymentTerms: "Net 30" }).returning();
  const [v6] = await db.insert(vendorsTable).values({ name: "Elite Transport Co.", category: "Logistics", contactPerson: "Deepak Pillai", phone: "9876543215", location: "Thiruvananthapuram", rating: 4, paymentTerms: "Net 15" }).returning();

  // Assets
  await db.insert(assetsTable).values([
    { name: "Martin MAC 700 Moving Head x8", category: "Lighting", purchaseDate: "2021-03-15", purchaseCost: "480000", currentBookValue: "350000", condition: "excellent", storageLocation: "Warehouse A" },
    { name: "L-Acoustics KARA Line Array System", category: "AV Equipment", purchaseDate: "2022-01-20", purchaseCost: "1200000", currentBookValue: "980000", condition: "excellent", storageLocation: "Warehouse A", rentalValue: "35000" },
    { name: "LED Video Wall 20sqm Panel Set", category: "Displays", purchaseDate: "2022-06-10", purchaseCost: "850000", currentBookValue: "680000", condition: "good", storageLocation: "Warehouse B", rentalValue: "25000" },
    { name: "Event Management Vehicle (Tempo)", category: "Vehicles", purchaseDate: "2020-11-01", purchaseCost: "650000", currentBookValue: "420000", condition: "good", storageLocation: "Office Parking" },
    { name: "Stage Platform 40x30ft", category: "Stage Equipment", purchaseDate: "2021-08-15", purchaseCost: "320000", currentBookValue: "260000", condition: "good", storageLocation: "Warehouse B" },
    { name: "Truss Rig System - Complete Set", category: "Rigging", purchaseDate: "2021-09-01", purchaseCost: "180000", currentBookValue: "145000", condition: "excellent", storageLocation: "Warehouse A" },
    { name: "Genset 125 KVA", category: "Power", purchaseDate: "2022-03-10", purchaseCost: "550000", currentBookValue: "450000", condition: "good", storageLocation: "Warehouse B" },
  ]);

  // Marketing channels
  const [mc1] = await db.insert(marketingChannelsTable).values({ name: "Social Media (Instagram/FB)", isActive: true }).returning();
  const [mc2] = await db.insert(marketingChannelsTable).values({ name: "Google Ads", isActive: true }).returning();
  const [mc3] = await db.insert(marketingChannelsTable).values({ name: "Referral / Word of Mouth", isActive: true }).returning();
  const [mc4] = await db.insert(marketingChannelsTable).values({ name: "Event Exhibitions", isActive: true }).returning();
  const [mc5] = await db.insert(marketingChannelsTable).values({ name: "WhatsApp Marketing", isActive: true }).returning();

  // Marketing spend (last 12 months)
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    await db.insert(marketingSpendTable).values([
      { channelId: mc1.id, amount: String(Math.floor(45000 + Math.random() * 15000)), leadsGenerated: Math.floor(18 + Math.random() * 12), qualifiedLeads: Math.floor(8 + Math.random() * 6), customersAcquired: Math.floor(2 + Math.random() * 3), revenueGenerated: String(Math.floor(350000 + Math.random() * 150000)), grossProfitGenerated: String(Math.floor(100000 + Math.random() * 50000)), year: y, month: m },
      { channelId: mc2.id, amount: String(Math.floor(35000 + Math.random() * 10000)), leadsGenerated: Math.floor(12 + Math.random() * 8), qualifiedLeads: Math.floor(5 + Math.random() * 4), customersAcquired: Math.floor(1 + Math.random() * 2), revenueGenerated: String(Math.floor(200000 + Math.random() * 100000)), grossProfitGenerated: String(Math.floor(60000 + Math.random() * 30000)), year: y, month: m },
      { channelId: mc3.id, amount: String(Math.floor(5000 + Math.random() * 5000)), leadsGenerated: Math.floor(6 + Math.random() * 6), qualifiedLeads: Math.floor(4 + Math.random() * 4), customersAcquired: Math.floor(2 + Math.random() * 2), revenueGenerated: String(Math.floor(400000 + Math.random() * 200000)), grossProfitGenerated: String(Math.floor(130000 + Math.random() * 60000)), year: y, month: m },
    ]);
  }

  // Clients
  const clients = await db.insert(clientsTable).values([
    { name: "Vineeth & Aparna", company: "Private Family", clientType: "Personal (Wedding)", industry: "Individual", leadSource: "Referral", location: "Kochi", phone: "9876001001", email: "vineeth@email.com", notes: "Premium client, very detail-oriented. Repeat business likely." },
    { name: "TechCorp India Pvt Ltd", company: "TechCorp India Pvt Ltd", clientType: "Corporate", industry: "Technology", leadSource: "Google Ads", location: "Thiruvananthapuram", contactPerson: "HR Head - Ramesh Kumar", phone: "9876001002", email: "events@techcorp.in" },
    { name: "Lakshmi & Govind", company: "Private Family", clientType: "Personal (Wedding)", industry: "Individual", leadSource: "Instagram", location: "Thrissur", phone: "9876001003" },
    { name: "Kerala Medical Association", company: "Kerala Medical Association", clientType: "Association", industry: "Healthcare", leadSource: "Exhibition", location: "Kochi", contactPerson: "Dr. Suresh Pillai", phone: "9876001004", email: "events@kma.org" },
    { name: "Muthoot Finance Ltd", company: "Muthoot Finance Ltd", clientType: "Corporate", industry: "Finance", leadSource: "Referral", location: "Kochi", contactPerson: "Admin Head", phone: "9876001005", email: "admin.events@muthoot.com" },
    { name: "Arun & Meera", company: "Private Family", clientType: "Personal (Wedding)", industry: "Individual", leadSource: "WhatsApp", location: "Kozhikode", phone: "9876001006" },
    { name: "Kerala IT Mission", company: "Kerala IT Mission", clientType: "Government", industry: "Technology", leadSource: "Direct Inquiry", location: "Thiruvananthapuram", contactPerson: "Jyothi Krishnan", phone: "9876001007" },
    { name: "HDFC Bank - Kerala Zone", company: "HDFC Bank Ltd", clientType: "Corporate", industry: "Finance", leadSource: "Referral", location: "Kochi", contactPerson: "Zonal HR Manager", phone: "9876001008" },
    { name: "Sreekanth & Devika", company: "Private Family", clientType: "Personal (Wedding)", industry: "Individual", leadSource: "Instagram", location: "Palakkad", phone: "9876001009" },
    { name: "Kairali Hotels Group", company: "Kairali Hotels Group", clientType: "Corporate", industry: "Hospitality", leadSource: "Referral", location: "Kochi", contactPerson: "Biju Mathew", phone: "9876001010", email: "events@kairali.com" },
  ]).returning();

  // Events (spanning ~18 months, both past and upcoming)
  const eventDefs = [
    { name: "Vineeth & Aparna Grand Wedding", clientIdx: 0, type: "Wedding", status: "completed", date: `${yr-1}-12-18`, venue: "Le Meridien Kochi", location: "Kochi", revenue: 2200000, discount: 0, gst: 396000, advance: 800000, second: 1000000, final: 400000, costs: [{ cat: "Decor & Florals", amt: 380000, vId: v2.id }, { cat: "AV & Lighting", amt: 280000, vId: v1.id }, { cat: "Catering", amt: 450000, vId: v3.id }, { cat: "Photography & Video", amt: 180000, vId: v4.id }, { cat: "Stage & Tent", amt: 120000, vId: v5.id }, { cat: "Logistics", amt: 45000, vId: v6.id }] },
    { name: "TechCorp Annual Awards Night", clientIdx: 1, type: "Corporate Event", status: "completed", date: `${yr-1}-11-25`, venue: "Crowne Plaza Kochi", location: "Kochi", revenue: 1450000, discount: 50000, gst: 261000, advance: 600000, second: 600000, final: 200000, costs: [{ cat: "AV & Lighting", amt: 320000, vId: v1.id }, { cat: "Stage & Tent", amt: 180000, vId: v5.id }, { cat: "Catering", amt: 280000, vId: v3.id }, { cat: "Logistics", amt: 55000, vId: v6.id }] },
    { name: "Kerala Medical Association Annual Summit", clientIdx: 3, type: "Conference", status: "completed", date: `${yr-1}-10-14`, venue: "Hotel Taj Gateway, Kochi", location: "Kochi", revenue: 980000, discount: 0, gst: 176400, advance: 400000, second: 400000, final: 180000, costs: [{ cat: "AV & Lighting", amt: 220000, vId: v1.id }, { cat: "Catering", amt: 210000, vId: v3.id }, { cat: "Stage & Tent", amt: 90000, vId: v5.id }, { cat: "Logistics", amt: 35000, vId: v6.id }] },
    { name: "Lakshmi & Govind Wedding Celebration", clientIdx: 2, type: "Wedding", status: "completed", date: `${yr}-01-22`, venue: "The Leela, Kovalam", location: "Thiruvananthapuram", revenue: 1850000, discount: 0, gst: 333000, advance: 700000, second: 800000, final: 350000, costs: [{ cat: "Decor & Florals", amt: 320000, vId: v2.id }, { cat: "AV & Lighting", amt: 250000, vId: v1.id }, { cat: "Catering", amt: 380000, vId: v3.id }, { cat: "Photography & Video", amt: 160000, vId: v4.id }, { cat: "Stage & Tent", amt: 110000, vId: v5.id }] },
    { name: "Muthoot Finance Leadership Conclave", clientIdx: 4, type: "Corporate Event", status: "completed", date: `${yr}-02-10`, venue: "Marriott Kochi", location: "Kochi", revenue: 1650000, discount: 50000, gst: 297000, advance: 700000, second: 700000, final: 200000, costs: [{ cat: "AV & Lighting", amt: 290000, vId: v1.id }, { cat: "Stage & Tent", amt: 200000, vId: v5.id }, { cat: "Catering", amt: 350000, vId: v3.id }, { cat: "Photography & Video", amt: 85000, vId: v4.id }, { cat: "Logistics", amt: 60000, vId: v6.id }] },
    { name: "Arun & Meera Wedding", clientIdx: 5, type: "Wedding", status: "completed", date: `${yr}-03-08`, venue: "Beachfront Resort, Kozhikode", location: "Kozhikode", revenue: 1200000, discount: 0, gst: 216000, advance: 500000, second: 500000, final: 200000, costs: [{ cat: "Decor & Florals", amt: 250000, vId: v2.id }, { cat: "AV & Lighting", amt: 200000, vId: v1.id }, { cat: "Catering", amt: 280000, vId: v3.id }, { cat: "Photography & Video", amt: 120000, vId: v4.id }] },
    { name: "Kerala IT Mission Digital India Summit", clientIdx: 6, type: "Government Event", status: "completed", date: `${yr}-04-20`, venue: "Mascot Hotel, Trivandrum", location: "Thiruvananthapuram", revenue: 2800000, discount: 0, gst: 504000, advance: 1000000, second: 1200000, final: 600000, costs: [{ cat: "AV & Lighting", amt: 480000, vId: v1.id }, { cat: "Stage & Tent", amt: 380000, vId: v5.id }, { cat: "Catering", amt: 520000, vId: v3.id }, { cat: "Photography & Video", amt: 160000, vId: v4.id }, { cat: "Logistics", amt: 90000, vId: v6.id }, { cat: "Decor & Florals", amt: 220000, vId: v2.id }] },
    { name: "HDFC Bank Kerala Zone Annual Day", clientIdx: 7, type: "Corporate Event", status: "completed", date: `${yr}-05-15`, venue: "Hotel Renai Cochin", location: "Kochi", revenue: 1380000, discount: 80000, gst: 248400, advance: 600000, second: 600000, final: 132000, costs: [{ cat: "AV & Lighting", amt: 260000, vId: v1.id }, { cat: "Catering", amt: 300000, vId: v3.id }, { cat: "Stage & Tent", amt: 150000, vId: v5.id }, { cat: "Logistics", amt: 45000, vId: v6.id }] },
    { name: "Sreekanth & Devika Royal Wedding", clientIdx: 8, type: "Wedding", status: "completed", date: `${yr}-06-28`, venue: "Heritage Palace, Palakkad", location: "Palakkad", revenue: 2600000, discount: 0, gst: 468000, advance: 1000000, second: 1100000, final: 500000, costs: [{ cat: "Decor & Florals", amt: 450000, vId: v2.id }, { cat: "AV & Lighting", amt: 320000, vId: v1.id }, { cat: "Catering", amt: 520000, vId: v3.id }, { cat: "Photography & Video", amt: 200000, vId: v4.id }, { cat: "Stage & Tent", amt: 180000, vId: v5.id }, { cat: "Logistics", amt: 65000, vId: v6.id }] },
    { name: "Kairali Hotels Business Summit 2025", clientIdx: 9, type: "Corporate Event", status: "in_progress", date: `${yr}-08-25`, venue: "Hotel Kairali Grand, Kochi", location: "Kochi", revenue: 1900000, discount: 100000, gst: 342000, advance: 800000, second: 0, final: 0, costs: [{ cat: "AV & Lighting", amt: 340000, vId: v1.id }, { cat: "Stage & Tent", amt: 220000, vId: v5.id }, { cat: "Catering", amt: 400000, vId: v3.id }, { cat: "Photography & Video", amt: 95000, vId: v4.id }, { cat: "Logistics", amt: 70000, vId: v6.id }] },
    { name: "TechCorp Product Launch Event", clientIdx: 1, type: "Product Launch", status: "upcoming", date: `${yr}-09-18`, venue: "Crowne Plaza Kochi", location: "Kochi", revenue: 1600000, discount: 0, gst: 288000, advance: 600000, second: 0, final: 0, costs: [{ cat: "AV & Lighting", amt: 350000, vId: v1.id }, { cat: "Stage & Tent", amt: 200000, vId: v5.id }, { cat: "Catering", amt: 250000, vId: v3.id }] },
    { name: "Vineeth & Aparna 1st Anniversary Party", clientIdx: 0, type: "Private Party", status: "upcoming", date: `${yr}-12-18`, venue: "Rooftop Terrace, Le Meridien", location: "Kochi", revenue: 450000, discount: 0, gst: 81000, advance: 200000, second: 0, final: 0, costs: [{ cat: "Decor & Florals", amt: 80000, vId: v2.id }, { cat: "Catering", amt: 100000, vId: v3.id }, { cat: "AV & Lighting", amt: 60000, vId: v1.id }] },
  ];

  for (const ev of eventDefs) {
    const client = clients[ev.clientIdx];
    const [event] = await db.insert(eventsTable).values({
      name: ev.name, clientId: client.id, eventType: ev.type, status: ev.status,
      eventDate: ev.date, venue: ev.venue, location: ev.location,
      salespersonId: emp3.id, operationsManagerId: emp2.id, isDemo: true,
    }).returning();

    const contractValue = ev.revenue;
    const discount = ev.discount;
    const gst = ev.gst;
    const netRevenue = contractValue - discount;
    const totalInvoiceValue = contractValue + gst - discount;
    const totalCollected = ev.advance + ev.second + ev.final;
    const outstanding = Math.max(0, netRevenue - totalCollected);
    const paymentStatus = outstanding === 0 ? "paid" : (ev.status === "upcoming" ? "pending" : "partial");
    const dueDate = ev.status === "in_progress" || ev.status === "upcoming" ? `${yr}-10-01` : null;

    await db.insert(eventRevenueTable).values({
      eventId: event.id, contractValue: String(contractValue), discount: String(discount),
      gst: String(gst), totalInvoiceValue: String(totalInvoiceValue), netRevenue: String(netRevenue),
      advanceReceived: String(ev.advance), secondPayment: String(ev.second), finalPayment: String(ev.final),
      totalCollected: String(totalCollected), outstandingAmount: String(outstanding),
      paymentStatus, dueDate,
    });

    for (const cost of ev.costs) {
      const gstAmt = Math.floor(cost.amt * 0.18);
      await db.insert(eventCostsTable).values({
        eventId: event.id, vendorId: cost.vId, category: cost.cat,
        amount: String(cost.amt), gst: String(gstAmt), totalAmount: String(cost.amt + gstAmt),
        paymentStatus: ev.status === "completed" ? "paid" : "pending",
        date: ev.date, isDemo: true,
      });
    }
  }

  // Operating Expenses (last 8 months)
  const opexCategories = [
    { cat: "Salaries & Payroll", base: 580000 },
    { cat: "Office Rent", base: 55000 },
    { cat: "Utilities & Internet", base: 18000 },
    { cat: "Marketing & Advertising", base: 85000 },
    { cat: "Travel & Transport", base: 25000 },
    { cat: "Software & Tools", base: 22000 },
    { cat: "Miscellaneous", base: 15000 },
  ];

  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    for (const cat of opexCategories) {
      const variation = 0.9 + Math.random() * 0.2;
      const amount = Math.floor(cat.base * variation);
      await db.insert(operatingExpensesTable).values({
        category: cat.cat, description: `${cat.cat} - ${y}/${m}`, amount: String(amount),
        gst: "0", year: y, month: m, createdBy: emp5.id,
      });
    }
  }

  // Leads
  await db.insert(leadsTable).values([
    { contactName: "Rajan & Suma", contactPhone: "9988776655", source: "Instagram", eventType: "Wedding", expectedValue: "2500000", expectedProfit: "750000", probability: 75, salespersonId: emp3.id, dateReceived: `${yr}-07-01`, followUpDate: `${yr}-08-20`, status: "proposal_sent", notes: "High-value wedding, venue shortlisted" },
    { contactName: "Infosys BPO - Trivandrum", contactPhone: "9988776656", source: "LinkedIn", eventType: "Corporate Event", expectedValue: "3500000", expectedProfit: "980000", probability: 60, salespersonId: emp3.id, dateReceived: `${yr}-07-15`, followUpDate: `${yr}-08-22`, status: "negotiation", notes: "Annual tech summit, 500+ delegates" },
    { contactName: "Mohammed & Fathima", contactPhone: "9988776657", source: "WhatsApp", eventType: "Wedding", expectedValue: "1800000", expectedProfit: "550000", probability: 85, salespersonId: emp6.id, dateReceived: `${yr}-08-01`, followUpDate: `${yr}-08-19`, status: "requirement_received", notes: "January wedding, requirements shared" },
    { contactName: "Sobha Developers", contactPhone: "9988776658", source: "Referral", eventType: "Product Launch", expectedValue: "2200000", expectedProfit: "640000", probability: 50, salespersonId: emp3.id, dateReceived: `${yr}-08-05`, followUpDate: `${yr}-08-25`, status: "qualified", notes: "New residential project launch" },
    { contactName: "Kerala Tourism Board", contactPhone: "9988776659", source: "Government Tender", eventType: "Government Event", expectedValue: "5000000", expectedProfit: "1200000", probability: 40, salespersonId: emp3.id, dateReceived: `${yr}-08-10`, followUpDate: `${yr}-09-01`, status: "contacted", notes: "Tourism festival, competitive bidding" },
    { contactName: "Anoop & Nisha", contactPhone: "9988776660", source: "Google Ads", eventType: "Wedding", expectedValue: "950000", expectedProfit: "290000", probability: 90, salespersonId: emp6.id, dateReceived: `${yr}-08-12`, followUpDate: `${yr}-08-18`, status: "negotiation", notes: "Small intimate wedding, almost confirmed" },
    { contactName: "State Bank of India - Circle", contactPhone: "9988776661", source: "Direct Inquiry", eventType: "Corporate Event", expectedValue: "1800000", expectedProfit: "520000", probability: 30, salespersonId: emp3.id, dateReceived: `${yr}-08-14`, followUpDate: `${yr}-09-05`, status: "new", notes: "New inquiry, initial discussion pending" },
    { contactName: "Pradeep & Sheeba", contactPhone: "9988776662", source: "Referral - Vineeth", eventType: "Wedding", expectedValue: "2800000", expectedProfit: "840000", probability: 70, salespersonId: emp3.id, dateReceived: `${yr}-08-15`, followUpDate: `${yr}-08-21`, status: "proposal_sent", notes: "Referred by Vineeth, looking for similar premium setup" },
    { contactName: "Wipro Technologies", contactPhone: "9988776663", source: "LinkedIn", eventType: "Corporate Event", expectedValue: "4200000", expectedProfit: "1100000", probability: 25, salespersonId: emp3.id, dateReceived: `${yr}-07-20`, status: "lost", lostReason: "Budget constraints, went with cheaper vendor", notes: "Lost after second round of negotiations" },
    { contactName: "Amina & Hassan", contactPhone: "9988776664", source: "Instagram", eventType: "Wedding", expectedValue: "1500000", expectedProfit: "450000", probability: 100, salespersonId: emp6.id, dateReceived: `${yr}-06-01`, status: "won", notes: "Booked for November" },
  ]);

  // Valuation Scenarios
  await db.insert(valuationScenariosTable).values([
    { name: "Conservative", scenarioType: "conservative", targetValuation: "900000000", currentRevenue: "130000000", currentEbitda: "13000000", revenueGrowthRate: "0.20", ebitdaMargin: "0.10", revenueMultiple: "3.0", ebitdaMultiple: "8.0", notes: "Assumes slower growth, tighter margins", isDefault: false },
    { name: "Base Case", scenarioType: "base", targetValuation: "900000000", currentRevenue: "130000000", currentEbitda: "19500000", revenueGrowthRate: "0.30", ebitdaMargin: "0.15", revenueMultiple: "3.5", ebitdaMultiple: "10.0", notes: "Most likely scenario with sustained growth", isDefault: true },
    { name: "Aggressive", scenarioType: "aggressive", targetValuation: "900000000", currentRevenue: "130000000", currentEbitda: "26000000", revenueGrowthRate: "0.45", ebitdaMargin: "0.20", revenueMultiple: "4.5", ebitdaMultiple: "12.0", notes: "Geographic expansion, enterprise contracts", isDefault: false },
  ]);

  // Notifications
  await db.insert(notificationsTable).values([
    { type: "payment", title: "Payment Received", message: "₹8,00,000 advance received from Kairali Hotels for Business Summit 2025.", isRead: false, entityType: "event", entityId: 10 },
    { type: "lead_update", title: "Lead Status Updated", message: "Infosys BPO lead moved to Negotiation stage. Follow-up call scheduled.", isRead: false, entityType: "lead" },
    { type: "follow_up", title: "Follow-up Due Today", message: "3 lead follow-ups are due today. Review your pipeline.", isRead: false },
    { type: "milestone", title: "Revenue Milestone", message: "YTD revenue has crossed ₹1 Crore mark. Excellent progress!", isRead: true },
    { type: "payment", title: "Payment Overdue", message: "Final payment of ₹1,10,000 pending from Kairali Hotels (30 days overdue).", isRead: false, entityType: "event" },
  ]);

  // Audit log entries
  await db.insert(auditLogsTable).values([
    { userId: emp1.id, userEmail: "arjun@auroneventproductions.com", action: "create", entityType: "event", entityId: 1, newValues: { name: "Vineeth & Aparna Grand Wedding", status: "upcoming" } },
    { userId: emp3.id, userEmail: "rahul@auroneventproductions.com", action: "update", entityType: "lead", entityId: 2, oldValues: { status: "qualified" }, newValues: { status: "negotiation" } },
    { userId: emp5.id, userEmail: "sanjay@auroneventproductions.com", action: "create", entityType: "event_revenue", entityId: 10, newValues: { contractValue: 1900000 } },
  ]);

  console.log("Seeding complete!");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
