import { useEffect, useState } from 'react';
import type { SheetTab } from '@workspace/api-client-react';

const STORAGE_KEY = 'stop-loss-sheet-workspace';
const EVENT_NAME = 'stop-loss-sheet-workspace-updated';

const seedTabs: SheetTab[] = [
  {
    name: 'Sync Metadata',
    rows: [
      { key: 'schema', value: 'stop-loss-workspace-v1' },
      { key: 'source', value: 'Stop Loss Quote & Policy Workspace' },
      { key: 'documentDestination', value: 'Google Drive' },
      { key: 'destinationEmail', value: 'ahpoladminsys@gmail.com' },
      { key: 'syncMode', value: 'manual pull / explicit push' },
    ],
  },
  {
    name: 'Policies',
    rows: [
      { id: 'POL-2026-88101', name: 'Arkel Constructors LLC', ein: '72-1029384', broker: 'Aon Risk Services', agent: 'Sarah Jenkins', tpa: 'HMO Louisiana, Inc. / BCBS LA', lives: 131, premium: 57792, status: 'Issued / Inforce', quote: 'Q-2026-99205', effective: '2025-11-01', expiry: '2026-10-31', network: 'Blue Cross Blue Shield Louisiana' },
      { id: 'POL-MOCK-001', name: 'Bayou Logistics Group', ein: '84-3019921', broker: 'Aon Risk Services', agent: 'Michael Chen', tpa: 'UMR / UnitedHealthcare', lives: 318, premium: 364461, status: 'Issued / Inforce', quote: 'Q-MOCK-001', effective: '2026-01-01', expiry: '2026-12-31', network: 'UnitedHealthcare Choice Plus' },
      { id: 'POL-MOCK-002', name: 'Piedmont Manufacturing Co.', ein: '56-8831042', broker: 'Marsh McLennan', agent: 'Priya Shah', tpa: 'Cigna ASO', lives: 246, premium: 289740, status: 'Issued / Inforce', quote: 'Q-MOCK-002', effective: '2026-02-01', expiry: '2027-01-31', network: 'Cigna Open Access Plus' },
      { id: 'POL-MOCK-003', name: 'Cascadia Software Holdings', ein: '91-6612038', broker: 'Arthur J. Gallagher', agent: 'Elena Torres', tpa: 'Premera Blue Cross / ASO', lives: 184, premium: 221316, status: 'Issued / Inforce', quote: 'Q-MOCK-003', effective: '2026-03-01', expiry: '2027-02-28', network: 'Premera Blue Cross' },
    ],
  },
  {
    name: 'Opportunities',
    rows: [
      { id: 'o1', name: 'American Ledger Holdings', product: 'BTA', stage: 'Onboarding', premium: 243862, lives: 4200, broker: 'Aon', plan: 'GlobalGuard' },
      { id: 'o2', name: 'Lonestar Freight Co', product: 'BTA', stage: 'Prospect', premium: 75185, lives: 1650, broker: 'Aon', plan: 'TravelSure Corporate' },
      { id: 'o3', name: 'Gulf Coast Energy', product: 'BTA', stage: 'Negotiating', premium: 135846, lives: 980, broker: 'Marsh McLennan', plan: 'ExecShield' },
      { id: 'o4', name: 'Great Lakes Manufacturing', product: 'BTA', stage: 'Launch', premium: 119056, lives: 2100, broker: 'Risk Strategies', plan: 'GlobalGuard' },
      { id: 'o5', name: 'Trailhead Outdoor Adventures', product: 'PA', stage: 'Launch', premium: 18750, lives: 180, broker: 'Aon', plan: 'GroupActive' },
      { id: 'o6', name: 'Cascade University', product: 'PA', stage: 'Prospect', premium: 18750, lives: 2900, broker: 'Direct', plan: 'EventShield' },
      { id: 'o7', name: 'Summit Athletics League', product: 'PA', stage: 'Negotiating', premium: 9597, lives: 320, broker: 'Tysers', plan: 'ActiCover' },
      { id: 'o8', name: 'Metro Public Schools', product: 'PA', stage: 'Onboarding', premium: 42000, lives: 5400, broker: 'Marsh McLennan', plan: 'FieldGuard' },
      { id: 'o9', name: 'Metro Public Schools', product: 'Stop Loss', stage: 'Prospect', premium: 310000, lives: 5400, broker: 'Marsh McLennan', plan: 'Specific & Aggregate', claimsAdmin: 'Meritain Health' },
      { id: 'o10', name: 'Beacon Retail Group', product: 'Stop Loss', stage: 'Negotiating', premium: 425000, lives: 3300, broker: 'Aon', plan: 'Specific Only', claimsAdmin: 'UMR' },
      { id: 'o11', name: 'Harbor Logistics', product: 'Stop Loss', stage: 'Onboarding', premium: 185000, lives: 740, broker: 'Tysers', plan: 'Aggregate Only', claimsAdmin: 'Sedgwick' },
      { id: 'o12', name: 'Apex Healthcare System', product: 'Stop Loss', stage: 'Launch', premium: 520000, lives: 6200, broker: 'Risk Strategies', plan: 'Specific & Aggregate', claimsAdmin: 'CoreSource / Trustmark' },
    ],
  },
  {
    name: 'Relationships',
    rows: [
      { id: 'a1', name: 'American Ledger Holdings', type: 'Policyholder', state: 'NY', broker: 'Aon', city: 'New York', employees: 4200 },
      { id: 'a2', name: 'Trailhead Outdoor Adventures', type: 'Policyholder', state: 'CO', broker: 'Aon', city: 'Boulder', employees: 180 },
      { id: 'a3', name: 'Lonestar Freight Co', type: 'Policyholder', state: 'TX', broker: 'Marsh McLennan', city: 'Dallas', employees: 1650 },
      { id: 'a4', name: 'Cascade University', type: 'Policyholder', state: 'WA', broker: 'Risk Strategies', city: 'Seattle', employees: 2900 },
      { id: 'a5', name: 'Gulf Coast Energy', type: 'Policyholder', state: 'FL', broker: 'Aon', city: 'Miami', employees: 980 },
      { id: 'a6', name: 'Summit Athletics League', type: 'Policyholder', state: 'GA', broker: 'Tysers', city: 'Atlanta', employees: 320 },
      { id: 'a7', name: 'Great Lakes Manufacturing', type: 'Policyholder', state: 'OH', broker: 'Risk Strategies', city: 'Cleveland', employees: 2100 },
      { id: 'a8', name: 'Metro Public Schools', type: 'Policyholder', state: 'IL', broker: 'Marsh McLennan', city: 'Chicago', employees: 5400 },
      { id: 'a9', name: 'Beacon Retail Group', type: 'Broker', state: 'AZ', broker: 'Direct', city: 'Phoenix', employees: 3300 },
    ],
  },
  {
    name: 'Contacts',
    rows: [
      { id: 'CON-ARK-001', policy: 'POL-2026-88101', relationshipId: 'REL-ARKEL', name: 'Holly Braud', email: 'hbraud@arkelconstructors.com', phone: '(225) 555-0199', role: 'Benefit Admin', type: 'Policy Holder', status: 'Active' },
      { id: 'CON-ARK-002', policy: 'POL-2026-88101', relationshipId: 'REL-AON', name: 'Sarah Jenkins', email: 'sarah.jenkins@example.com', phone: '(225) 555-0100', role: 'Agent', type: 'Broker', status: 'Active' },
    ],
  },
  {
    name: 'Enrollment',
    rows: [
      { id: 'SUB-ARK-001', name: 'Frank Albarracin', email: 'falbarracin@arkelconstructors.com', phone: '(225) 555-0144', tier: 'Single (E)', plan: 'PPO Blue Saver', dependents: 0, policy: 'POL-2026-88101', status: 'Active' },
      { id: 'SUB-ARK-002', name: 'Holly Braud', email: 'hbraud@arkelconstructors.com', phone: '(225) 555-0199', tier: 'Employee & Spouse (ES)', plan: 'Group Care Copay PPO', dependents: 1, policy: 'POL-2026-88101', status: 'Active' },
      { id: 'SUB-ARK-003', name: 'Marcus Vance', tier: 'Family (F)', plan: 'Group Care Copay PPO', dependents: 2, policy: 'POL-2026-88101', status: 'Active' },
      { id: 'SUB-MOCK-001', name: 'Nina Broussard', email: 'nina.broussard@bayoulogistics.example', tier: 'Single (E)', plan: 'PPO Choice Plus', dependents: 0, policy: 'POL-MOCK-001', status: 'Active' },
      { id: 'SUB-MOCK-002', name: 'Caleb Williams', email: 'caleb.williams@piedmont.example', tier: 'Employee & Spouse (ES)', plan: 'Cigna Open Access Plus', dependents: 1, policy: 'POL-MOCK-002', status: 'Active' },
      { id: 'SUB-MOCK-003', name: 'Maya Iyer', email: 'maya.iyer@cascadia.example', tier: 'Family (F)', plan: 'Premera PPO', dependents: 2, policy: 'POL-MOCK-003', status: 'Active' },
    ],
  },
  {
    name: 'Claims',
    rows: [
      { id: 'CLM-2026-9041', policy: 'POL-2026-88101', claimant: 'Frank Albarracin', date: '2026-07-18', provider: 'Ochsner Health Center', diagnosis: 'Outpatient specialist visit', billed: 350, paid: 280, type: 'Specific', status: 'Processed / Paid' },
      { id: 'CLM-2026-8812', policy: 'POL-2026-88101', claimant: 'Holly Braud', date: '2026-05-10', provider: 'Baton Rouge General Clinic', diagnosis: 'Diagnostic imaging (MRI)', billed: 1850, paid: 1410, type: 'Specific', status: 'Processed / Paid' },
      { id: 'CLM-MOCK-001', policy: 'POL-MOCK-001', claimant: 'Nina Broussard', date: '2026-06-14', provider: 'Ochsner Health', diagnosis: 'Outpatient surgery', billed: 4200, paid: 3100, type: 'Specific', status: 'Processed / Paid' },
      { id: 'CLM-MOCK-002', policy: 'POL-MOCK-002', claimant: 'Caleb Williams', date: '2026-07-02', provider: 'Atrium Health', diagnosis: 'Inpatient admission', billed: 18750, paid: 14200, type: 'Specific', status: 'Under Review' },
      { id: 'CLM-MOCK-003', policy: 'POL-MOCK-003', claimant: 'Maya Iyer', date: '2026-05-20', provider: 'Swedish Medical Center', diagnosis: 'Specialist care', billed: 980, paid: 760, type: 'Specific', status: 'Processed / Paid' },
    ],
  },
  {
    name: 'Premium Ledger',
    rows: [
      { date: '2026-08-01', month: '2026-08', type: 'Monthly Booking', amount: 57792, policy: 'POL-2026-88101', warRisk: 'Yes', status: 'Booked' },
      { date: '2026-08-01', month: '2026-08', type: 'Monthly Booking', amount: 30371.75, policy: 'POL-MOCK-001', warRisk: 'Yes', status: 'Booked' },
      { date: '2026-08-01', month: '2026-08', type: 'Monthly Booking', amount: 24145, policy: 'POL-MOCK-002', warRisk: 'Yes', status: 'Booked' },
      { date: '2026-08-01', month: '2026-08', type: 'Monthly Booking', amount: 18443, policy: 'POL-MOCK-003', warRisk: 'Yes', status: 'Booked' },
    ],
  },
  {
    name: 'Documents',
    rows: [
      { id: 'POL-2026-88101-DOC-1', parentType: 'Policy', parentId: 'POL-2026-88101', name: 'Group_Care_Copay_SBC_2026.pdf', tag: 'Plan Designs', size: '420 KB', source: 'Quote process' },
      { id: 'POL-2026-88101-DOC-2', parentType: 'Policy', parentId: 'POL-2026-88101', name: 'BCBS_LA_Arkel_Claims_Nov2025_Jul2026.xlsx', tag: 'Claims Data', size: '1.2 MB', source: 'Quote process' },
      { id: 'POL-2026-88101-DOC-3', parentType: 'Policy', parentId: 'POL-2026-88101', name: 'Arkel_RFP_Cover_Sheet.pdf', tag: 'RFP', size: '860 KB', source: 'Quote process' },
      { id: 'o11-DOC-1', parentType: 'Opportunity', parentId: 'o11', name: 'Harbor_Logistics_RFP.pdf', tag: 'RFP', size: '860 KB', source: 'CRM opportunity' },
    ],
  },
  {
    name: 'Audit Log',
    rows: [
      { id: 'LOG-2026-1001', time: '2026-08-26 10:14:02', policy: 'POL-2026-88101', category: 'RFP INTAKE', detail: 'Initial Stop-Loss RFP created and quote inputs synchronized.', actor: 'Underwriter', status: 'Logged' },
      { id: 'LOG-2026-1002', time: '2026-08-26 10:17:44', policy: 'POL-2026-88101', category: 'SANCTIONS', detail: 'Quote-stage OFAC, PEP and AML checks returned clear.', actor: 'Compliance Engine', status: 'Cleared' },
      { id: 'LOG-2026-1003', time: '2026-08-26 10:22:18', policy: 'POL-2026-88101', category: 'POLICY', detail: 'Policy issued and premium booking ledger initialized.', actor: 'Underwriter', status: 'Logged' },
    ],
  },
  {
    name: 'Sanctions',
    rows: [
      { entity: 'Arkel Constructors LLC', ref: 'POL-2026-88101', score: 0, status: 'Approved / Cleared', database: 'OFAC SDN, PEP, EU Sanctions', trigger: 'Bind' },
      { entity: 'Apex Voluntary Benefits LLC', ref: 'POL-2026-9811', score: 94, status: 'Action Needed', database: 'OFAC SDN, EU Sanctions', trigger: 'Bind' },
      { entity: 'Global Health Dental Group', ref: 'Q-880291', score: 82, status: 'Under Review', database: 'PEP List', trigger: 'Quote' },
      { entity: 'CareFirst GAP Solutions', ref: 'Q-991024', score: 0, status: 'Approved / Cleared', database: 'None', trigger: 'Quote' },
    ],
  },
  {
    name: 'Extracted Data',
    rows: [
      { recordType: 'Quote Configuration', recordId: 'Q-2026-99205', field: 'specific.baseDeductible', value: 50000 },
      { recordType: 'Quote Configuration', recordId: 'Q-2026-99205', field: 'specific.reportingThreshold', value: 25000 },
      { recordType: 'Quote Configuration', recordId: 'Q-2026-99205', field: 'aggregate.expectedPepm', value: 320.5 },
      { recordType: 'Quote Configuration', recordId: 'Q-2026-99205', field: 'aggregate.corridor', value: 1.25 },
      { recordType: 'Quote Configuration', recordId: 'Q-2026-99205', field: 'aggregate.attachment', value: 2500000 },
    ],
  },
];

let memoryTabs = seedTabs;

function cloneTabs(tabs: SheetTab[]) {
  return tabs.map((tab) => ({ ...tab, rows: tab.rows.map((row) => ({ ...row })) }));
}

function readStoredTabs() {
  if (typeof window === 'undefined') return cloneTabs(memoryTabs);
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as SheetTab[]) : cloneTabs(memoryTabs);
  } catch {
    return cloneTabs(memoryTabs);
  }
}

export function getApplicationTabs() {
  return cloneTabs(readStoredTabs());
}

export function replaceApplicationTabs(tabs: SheetTab[]) {
  memoryTabs = cloneTabs(tabs);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryTabs));
    window.dispatchEvent(new Event(EVENT_NAME));
  }
}

export function updateApplicationTab(name: string, rows: SheetTab['rows']) {
  const tabs = getApplicationTabs();
  const index = tabs.findIndex((tab) => tab.name === name);
  if (index >= 0) tabs[index] = { ...tabs[index], rows };
  else tabs.push({ name, rows });
  replaceApplicationTabs(tabs);
}

export function useApplicationTabs() {
  const [tabs, setTabs] = useState<SheetTab[]>(readStoredTabs);
  useEffect(() => {
    const refresh = () => setTabs(readStoredTabs());
    window.addEventListener(EVENT_NAME, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT_NAME, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return tabs;
}

export const formatSyncedAt = (value: string | null | undefined) => {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};