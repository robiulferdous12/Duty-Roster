import type { Employee, RosterStore } from '../types';

// ── Employees ──
const employees: Employee[] = [
  { id: '3405', name: 'Joyonta Debroy', designation: 'Maint. Supervisor', team: 'Electrical' },
  { id: '3649', name: 'Kazi Likkhon', designation: 'Sr. Electrician', team: 'Electrical' },
  { id: '5864', name: 'Amdadul Haque', designation: 'Sr. Electrician', team: 'Electrical' },
  { id: '6529', name: 'Jamal Uddin', designation: 'Electrician', team: 'Electrical' },
  { id: '7657', name: 'Mamun Ur Rashid', designation: 'Electrician', team: 'Electrical' },
  { id: '9474', name: 'Motiur Rahman', designation: 'Electrician', team: 'Electrical' },
  { id: '9475', name: 'Saiful Islam', designation: 'Electrician', team: 'Electrical' },
  { id: '37978', name: 'Ashraful Islam', designation: 'Electrician', team: 'Electrical' },
  { id: '38000', name: 'Aktaruzzaman', designation: 'Asst. Electrician', team: 'Electrical' },
  { id: '38027', name: 'Delwar Hossain', designation: 'Asst. Electrician', team: 'Electrical' },
  { id: '7653', name: 'Solaiman Mia', designation: 'Generator Operator', team: 'Substation' },
  { id: '7654', name: 'Obaidul Haque', designation: 'Generator Operator', team: 'Substation' },
  { id: '37965', name: 'Mofazzal Hossain', designation: 'Asst. Electrician', team: 'Electrical' },
  { id: '37999', name: 'Sumon Hossain', designation: 'Asst. Electrician', team: 'Electrical' },
  { id: '4693', name: 'Abul Kalam', designation: 'Sr. Technician', team: 'Mechanical' },
  { id: '6525', name: 'Shafiqul Islam', designation: 'Technician', team: 'Mechanical' },
  { id: '6526', name: 'Abu Bakkor', designation: 'Technician', team: 'Mechanical' },
  { id: '9472', name: 'Topesh Kumar', designation: 'Technician', team: 'Mechanical' },
  { id: '37946', name: 'Khushi Mohon', designation: 'Technician', team: 'Mechanical' },
  { id: '37943', name: 'Ridoy Bachchu', designation: 'Fabricator', team: 'Mechanical' },
  { id: '37944', name: 'Mahmudul Hasan', designation: 'Technician', team: 'Mechanical' },
  { id: '38022', name: 'Saidul Islam', designation: 'Asst. Technician', team: 'Mechanical' },
  { id: '38019', name: 'Ziaul Haque', designation: 'Painter', team: 'Mechanical' },
  { id: '4692', name: 'Marafat Ali', designation: 'Store Keeper', team: 'Store' },
  { id: '6530', name: 'Abdul Mannan', designation: 'Store Keeper', team: 'Store' },
  { id: '37967', name: 'Unus Ali', designation: 'Asst. Machine Oper.', team: 'Mechanical' },
  { id: '1270', name: 'Anisur Rahman', designation: 'Maint. Supervisor', team: 'Mechanical' },
  { id: '6528', name: 'Mohor Ali', designation: 'Sr. Technician', team: 'Mechanical' },
  { id: '2824', name: 'Mir Rabiul Azam', designation: 'Sr. Technician', team: 'Mechanical' },
  { id: '3404', name: 'Samol Chandra', designation: 'Sr. Technician', team: 'Mechanical' },
  { id: 'C 24367', name: 'Ruhul Amin', designation: 'Sr. Technician', team: 'Mechanical' },
  { id: 'C 15450', name: 'Sumon Morol', designation: 'Asst. Technician', team: 'Mechanical' },
  { id: 'C 21482', name: 'Ashik', designation: 'Asst. Technician', team: 'Mechanical' },
  { id: 'C 21498', name: 'Abdul Bari', designation: 'Technician', team: 'Mechanical' },
];

export const mockRosterStore: RosterStore = {
  year: 2026,
  month: 6, // July (0-indexed)
  employees,
  monthlyGrids: {},
};
