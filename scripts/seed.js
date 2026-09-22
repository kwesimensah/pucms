/**
 * Seeds the JSON data store with demo accounts and realistic sample
 * complaints so the prototype can be explored immediately.
 * Run with: npm run seed
 */
const { v4: uuidv4 } = require('uuid');
const db = require('../services/db');
const authService = require('../services/authService');
const complaintService = require('../services/complaintService');

const FILES = ['users', 'administrators', 'complaints', 'statusHistory', 'aiClassifications', 'responses', 'notifications', 'auditLog'];

function reset() {
  FILES.forEach((f) => db.writeAll(f, []));
}

function createAdmin(fullName, email, password) {
  const admin = {
    id: uuidv4(),
    role: 'admin',
    fullName,
    email: email.toLowerCase(),
    passwordHash: authService.hashPassword(password),
    createdAt: new Date().toISOString()
  };
  db.insert('administrators', admin);
  return admin;
}

function createCitizen(fullName, email, password, phone) {
  return authService.registerCitizen({ fullName, email, password, phone });
}

const SAMPLE_COMPLAINTS = [
  ['Electricity', 'No power in Dansoman since last night', 'ECG power has been off since last night in our area. The whole street is affected and we have no idea when it will be restored.', 'Dansoman, Accra'],
  ['Electricity', 'Sudden power surge damaged my fridge', 'There was a power surge yesterday evening that damaged my refrigerator and TV. This is dangerous and needs urgent attention.', 'Kasoa, Central Region'],
  ['Electricity', 'Billing amount is incorrect', 'My electricity bill is much higher than my normal monthly bill even though I used less power this month. Please review my meter reading.', 'Adenta, Accra'],
  ['Electricity', 'How do I change my billing address', 'How can I change my billing address on my ECG account? I recently moved to a new house.', 'East Legon, Accra'],
  ['Electricity', 'Entire community without electricity for days', 'Our entire community has been without electricity since yesterday. Many households with children and elderly people are affected.', 'Madina, Accra'],
  ['Electricity', 'Exposed live wire near school', 'There is broken electrical infrastructure causing immediate danger. An exposed live wire is hanging near the primary school entrance.', 'Tema Community 1'],
  ['Electricity', 'Prepaid meter not accepting credit', 'My prepaid meter is not accepting the credit I purchased. I have tried three times and lost money.', 'Achimota, Accra'],
  ['Electricity', 'Frequent power fluctuations damaging appliances', 'We are experiencing constant power fluctuation in our area, it keeps damaging our electronics.', 'Spintex, Accra'],
  ['Electricity', 'Transformer sparking at night', 'The transformer near our house has been sparking at night for the past three days. This looks like a fire hazard.', 'Ashaiman'],
  ['Electricity', 'No light for a week in our area', 'Dumsor has been going on in our area for a full week now with no explanation from ECG.', 'Kumasi, Ashanti Region'],
  ['Water', 'No water supply for three days', 'Water has not been flowing for three days now. We are struggling to get water for daily use.', 'Tema Community 5'],
  ['Water', 'Low water pressure for two days', 'My water pressure has been low for two days, barely a trickle comes out of the tap.', 'Osu, Accra'],
  ['Water', 'Burst pipe flooding the street', 'There is a burst pipe on our street that has been flooding the road for two days and wasting a lot of water.', 'Nungua, Accra'],
  ['Water', 'Dirty brown water from taps', 'The water coming from our taps is dirty and brown colored. We are worried about drinking it.', 'Sekondi-Takoradi'],
  ['Water', 'Entire estate has no running water', 'Our entire estate has had no running water for four days despite paying our bills on time.', 'Tema, Community 25'],
  ['Water', 'Water bill seems too high', 'My water bill this month seems unusually high compared to previous months. Could this be an error?', 'Cantonments, Accra'],
  ['Water', 'Leaking pipe wasting water at junction', 'There is a leaking pipe at the junction near our house that has been running for a week, wasting a lot of water.', 'Kaneshie, Accra'],
  ['Water', 'No water pressure upstairs', 'We have low water pressure upstairs in our building, ground floor is fine but upstairs barely gets any water.', 'Dzorwulu, Accra'],
  ['Sanitation', 'Garbage not collected in two weeks', 'Garbage has not been collected from our community for two weeks now, it is starting to smell very bad.', 'Nima, Accra'],
  ['Sanitation', 'Overflowing public dumpsite', 'The public dump site near the market is overflowing and attracting flies and rodents.', 'Agbogbloshie, Accra'],
  ['Sanitation', 'Blocked drainage causing flooding', 'The gutter near our compound is blocked with refuse and causes flooding whenever it rains.', 'Teshie, Accra'],
  ['Sanitation', 'Sewage overflow near residential area', 'There is sewage overflowing from a broken pipe near our homes. This is a serious health hazard for our children.', 'Chorkor, Accra'],
  ['Sanitation', 'Refuse truck skipped our area again', 'The refuse collection truck has skipped our area again this week, this is the third time this month.', 'Lapaz, Accra'],
  ['Sanitation', 'Bad smell from blocked gutter', 'There is a persistent bad smell coming from a blocked gutter close to the school in our area.', 'Abeka, Accra'],
  ['Sanitation', 'Illegal dumping behind market', 'People are dumping waste illegally behind the market and it has not been cleared in a while.', 'Madina Market, Accra'],
  ['Telecommunications', 'No network signal for two days', 'We have had no network signal in our area for two days now, we cannot make calls or use data.', 'Ho, Volta Region'],
  ['Telecommunications', 'Unstable internet connection all week', 'The internet connection has been unstable for the past week, it keeps disconnecting every few minutes.', 'Airport Residential, Accra'],
  ['Telecommunications', 'Calls keep dropping during conversations', 'My calls keep dropping in the middle of conversations, this has been happening for several days.', 'Tamale, Northern Region'],
  ['Telecommunications', 'Mobile data not working after top up', 'I bought a data bundle but my mobile data is not working at all even after restarting my phone.', 'Sunyani, Bono Region'],
  ['Telecommunications', 'Very slow internet speeds', 'Our internet speed has been extremely slow for days, we can barely load web pages.', 'Cape Coast, Central Region'],
  ['Telecommunications', 'No network in our village', 'There is no network signal at all in our village since the storm last week, we are cut off from communication.', 'Nkawkaw, Eastern Region'],
  ['Telecommunications', 'Wifi router keeps disconnecting', 'Our home wifi router keeps disconnecting every hour, we have already restarted it many times.', 'Kokomlemle, Accra'],
  ['General', 'How do I update my contact details', 'How can I update my contact details and address on my utility accounts? I recently changed my phone number.', 'Labone, Accra'],
  ['General', 'General inquiry about complaint process', 'I have a general inquiry about how the complaint process works and how long it usually takes to resolve issues.', 'Dansoman, Accra'],
  ['Electricity', 'Meter reading appears incorrect', 'My electricity bill shows a wrong meter reading compared to what is actually showing on my meter box.', 'North Legon, Accra'],
  ['Water', 'Contaminated water quality concerns', 'We have noticed the water quality has changed, it looks contaminated water with a strange odor.', 'Weija, Accra'],
  ['Sanitation', 'Open defecation near community borehole', 'There is open defecation happening near our community borehole which is a serious sanitation and health concern.', 'Kasoa Newtown'],
  ['Telecommunications', 'Broadband down for entire community', 'Broadband internet has been down for our entire community since yesterday, no updates from the provider.', 'Dome, Accra'],
  ['Electricity', 'Voltage too low for appliances to work', 'The voltage supplied to our house is too low, our appliances like the fridge and fan barely work.', 'Awoshie, Accra'],
  ['Water', 'No water supply since last night', 'There has been no water supply since last night affecting our entire street, we need urgent assistance.', 'Gbawe, Accra']
];

function run() {
  reset();

  const admin1 = createAdmin('Ama Owusu', 'admin@pucms.gov.gh', 'Admin@2026');
  createAdmin('Kojo Mensah', 'kojo.mensah@pucms.gov.gh', 'Admin@2026');

  const citizens = [
    createCitizen('Yaw Boateng', 'yaw.boateng@example.com', 'Citizen@123', '+233241234567'),
    createCitizen('Abena Asante', 'abena.asante@example.com', 'Citizen@123', '+233207654321'),
    createCitizen('Kwabena Osei', 'kwabena.osei@example.com', 'Citizen@123', '+233551122334'),
    createCitizen('Akosua Addo', 'akosua.addo@example.com', 'Citizen@123', '+233264455667'),
    createCitizen('Kofi Ansah', 'kofi.ansah@example.com', 'Citizen@123', '+233209988776')
  ];

  let submittedCount = 0;
  SAMPLE_COMPLAINTS.forEach((row, idx) => {
    const [utility, title, description, location] = row;
    const citizen = citizens[idx % citizens.length];
    const { complaint } = complaintService.submitComplaint({
      userId: citizen.id, utility, title, description, location,
      phone: citizen.phone
    });
    submittedCount += 1;

    // Simulate some complaints progressing further through the workflow so
    // the dashboards and reports have varied, realistic-looking data.
    const roll = idx % 5;
    try {
      if (roll >= 1) {
        complaintService.updateStatus(complaint.id, 'Under Review', admin1.id);
      }
      if (roll >= 2) {
        complaintService.assignComplaint(complaint.id, admin1.id, `${utility} Operations Team`);
      }
      if (roll >= 3) {
        complaintService.updateStatus(complaint.id, 'In Progress', admin1.id);
        complaintService.addResponse(complaint.id, admin1.id, 'Our team has been dispatched to investigate this issue.', false);
      }
      if (roll >= 4) {
        complaintService.addResponse(complaint.id, admin1.id, 'Issue has been fixed on site. Please confirm on your end.', true);
        complaintService.updateStatus(complaint.id, 'Resolved', admin1.id);
      }
    } catch (e) {
      // ignore invalid transitions for edge cases in the demo loop
    }
  });

  console.log(`Seed complete: ${citizens.length} citizens, 2 administrators, ${submittedCount} complaints.`);
  console.log('');
  console.log('Demo Administrator login:');
  console.log('  email:    admin@pucms.gov.gh');
  console.log('  password: Admin@2026');
  console.log('');
  console.log('Demo Citizen login:');
  console.log('  email:    yaw.boateng@example.com');
  console.log('  password: Citizen@123');
}

run();
