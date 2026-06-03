// Embedded copies of the BLD sample CSVs that live alongside this file
// (dub12-team-roster.csv / dub12-asset-register.csv / dub12-constraint-log.csv).
//
// Files under app/ aren't served statically by Next.js, so the "Load BLD
// sample" button can't fetch() the .csv files directly. These string exports
// are the runtime copy the button parses. Keep them in sync with the .csv
// files (those remain the canonical, human-readable artifacts).

export const BLD_TEAM_CSV = `name,email,organisation,role,trade,deputy,phone
Commissioning Lead,commissioning.lead@contractor.example,Main Contractor,Commissioning lead,M&E,Site Manager,+353871234567
Site Manager,site.manager@contractor.example,Main Contractor,Site supervisor,M&E,Commissioning Lead,+353871234568
QA Engineer,qa.eng@contractor.example,Main Contractor,QA engineer,M&E,Site Manager,+353871234569
Electrical Lead,elec.lead@contractor.example,Main Contractor,Electrical lead,Electrical,Site Manager,+353871234570
Design Coordinator,design.coord@contractor.example,Main Contractor,Design lead,Containment,Site Engineer,+353871234571
Site Engineer,site.eng@contractor.example,Main Contractor,Site engineer,Containment,Design Coordinator,+353871234572
Drywall Foreman,drywall.foreman@contractor.example,Main Contractor,Drywall foreman,Drywall,Design Coordinator,+353871234573
Design Engineer,design.eng@design-studio.example,Design Studio,Engineer,Design,BIM Coordinator,+353871234574
BIM Coordinator,bim.coord@design-studio.example,Design Studio,BIM coordinator,Design,Design Engineer,+353871234575
Power PM,power.pm@power-sub.example,Power Sub,Project manager,Power,Power Field Engineer,+353871234576
Power Field Engineer,power.field@power-sub.example,Power Sub,Field engineer,Power,Power PM,+353871234577
Power Cx Engineer,power.cx@power-sub.example,Power Sub,Commissioning engineer,Power,Power PM,+353871234578
Client Witness,client.witness@client.example,Hyperscale Client,Client witness,Client,Client Cx Manager,+353871234579
Client Cx Manager,client.cx@client.example,Hyperscale Client,Commissioning manager,Client,Client Witness,+353871234580
`;

export const BLD_ASSETS_CSV = `asset_id,asset_type,current_stage,owner_name,owner_org,location,system,red_tag_date,yellow_tag_date,green_date,notes,activity_id
MER1-AHU-01,Air Handling Unit,Red candidate,Site Manager,Main Contractor,MER1 Main Electrical Room,Cooling,2026-05-15,,,Awaiting Rev D drawing from Design Lead,A1100
MER1-AHU-02,Air Handling Unit,Red candidate,Site Manager,Main Contractor,MER1 Main Electrical Room,Cooling,2026-05-16,,,Awaiting Rev D drawing from Design Lead,A1110
MER1-AHU-03,Air Handling Unit,Red-tagged,Site Manager,Main Contractor,MER1 Main Electrical Room,Cooling,2026-05-18,,,
MER1-CT-01,Cable Tray,Owner unclear,,,MER1 Main Electrical Room,Containment,2026-05-12,,,Clash with structural beam at column G7
MER1-CT-02,Cable Tray,Owner unclear,,,MER1 Main Electrical Room,Containment,2026-05-13,,,Clash with structural beam at column G7
MER1-CT-03,Cable Tray,Yellow,Design Coordinator,Main Contractor,MER1 Main Electrical Room,Containment,2026-05-08,2026-05-20,,
MER1-PNL-01,Distribution Panel,Delivered not installed,,Power Sub,MER1 Main Electrical Room,Power,2026-04-22,,,30+ days in warehouse - costing £8400/day,A1010
MER1-PNL-02,Distribution Panel,Delivered not installed,,Power Sub,MER1 Main Electrical Room,Power,2026-04-22,,,30+ days in warehouse - costing £8400/day,A1020
MER1-UPM-01,UPS Module,Yellow,Power Field Engineer,Power Sub,MER1 Main Electrical Room,Power,2026-04-30,2026-05-15,,,A1030
MER1-UPM-02,UPS Module,Yellow,Power Field Engineer,Power Sub,MER1 Main Electrical Room,Power,2026-04-30,2026-05-15,,
MER1-GEN-01,Generator,Designed,Electrical Lead,Main Contractor,MER1 Main Electrical Room,Power,,,,Commissioning sequence handoff unclear
COLO-EWSD-01,Electrical Distribution,Green,Electrical Lead,Main Contractor,Colo Hall 1,Power,2026-04-15,2026-04-28,2026-05-12,
COLO-EWSD-02,Electrical Distribution,Green,Electrical Lead,Main Contractor,Colo Hall 1,Power,2026-04-15,2026-04-28,2026-05-12,
COLO-EWSD-03,Electrical Distribution,Yellow,Electrical Lead,Main Contractor,Colo Hall 1,Power,2026-04-20,2026-05-08,,
COLO-EWSD-04,Electrical Distribution,Yellow,Electrical Lead,Main Contractor,Colo Hall 2,Power,2026-04-22,2026-05-10,,
COLO-EWSD-05,Electrical Distribution,Yellow,Electrical Lead,Main Contractor,Colo Hall 2,Power,2026-04-22,2026-05-10,,
COLO-CRAC-01,CRAC Unit,Green,Site Manager,Main Contractor,Colo Hall 1,Cooling,2026-03-28,2026-04-15,2026-05-02,
COLO-CRAC-02,CRAC Unit,Green,Site Manager,Main Contractor,Colo Hall 1,Cooling,2026-03-28,2026-04-15,2026-05-02,
COLO-CRAC-03,CRAC Unit,Yellow,Site Manager,Main Contractor,Colo Hall 2,Cooling,2026-04-05,2026-05-01,,
COLO-EH-01,Electrical Heater,Yellow,Site Manager,Main Contractor,Colo Hall 1,Power,2026-04-10,2026-05-05,,
COLO-EWS-01,Earthing System,Red-tagged,Site Manager,Main Contractor,Colo Hall 1,Power,2026-05-08,,,Earthing in Colo - frame for AC,A2100
COLO-EWS-02,Earthing System,Red candidate,Site Manager,Main Contractor,Colo Hall 2,Power,2026-05-12,,,Earthing in Colo - frame for AC
COLO-HRU-01,Heat Rejection Unit,Red candidate,Site Manager,Main Contractor,Roof above Colo,Cooling,2026-05-15,,,,A2010
COLO-HRU-02,Heat Rejection Unit,Red candidate,Site Manager,Main Contractor,Roof above Colo,Cooling,2026-05-15,,,,A2020
COLO-HRU-03,Heat Rejection Unit,Designed,Site Manager,Main Contractor,Roof above Colo,Cooling,,,,
ADMIN-CWTS-01,Cold Water Treatment,Green,Power Cx Engineer,Power Sub,Admin Plant,Cooling,2026-03-15,2026-04-02,2026-04-20,
ADMIN-CWTS-02,Cold Water Treatment,Green,Power Cx Engineer,Power Sub,Admin Plant,Cooling,2026-03-15,2026-04-02,2026-04-20,
ADMIN-FAS-01,Fire Alarm System,Yellow,Power PM,Power Sub,Admin Plant,Fire,2026-04-12,2026-05-05,,
ADMIN-FAS-02,Fire Alarm System,Yellow,Power PM,Power Sub,Admin Plant,Fire,2026-04-12,2026-05-05,,
ADMIN-SEC-01,Security Panel,Red candidate,,Hyperscale Client,Admin Plant,Security,2026-05-10,,,Awaiting MEP Consultant security model update
ADMIN-SEC-02,Security Panel,Owner unclear,,,Admin Plant,Security,2026-05-12,,,Dog box scope - JM Main Contractor to confirm
ADMIN-EH-01,Electrical Heater,Owner unclear,,,Admin Plant,Power,2026-05-08,,,
ADMIN-EH-02,Electrical Heater,Owner unclear,,,Admin Plant,Power,2026-05-08,,,
`;

export const BLD_CONSTRAINTS_CSV = `id,description,raised_date,raised_by,owner_name,owner_org,priority,status,linked_assets,deadline
C-001,Exercise on what's included in security vendor scope vs not (e.g. locks not in security scope),2026-03-12,FL,JM MEP Consultant,MEP Consultant,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-12
C-002,Model review - Main Contractor and MEP Consultant coordination on security model updates,2026-03-12,MD,FL Portal,Portal,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-12
C-003,FoK list for security camera and card reader locations - federated model only 90% complete,2026-03-12,MD,GV Specialist Sub,Specialist Sub,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-12
C-004,FoK list to be provided by GV - issued 03/04/2026 but not received by Main Contractor,2026-03-12,SC,GV Specialist Sub,Specialist Sub,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-12
C-005,Workshop on underground ducts with Main Contractor/MEP Consultant/Specialist Sub/Portal,2026-04-10,DON,SC,Main Contractor,Medium,working,ADMIN-SEC-01,2026-06-10
C-006,Power requirements for doors - GV Specialist Sub to review,2026-04-10,SC,GV Specialist Sub,Specialist Sub,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-10
C-007,Dog box scope - JM Main Contractor to confirm,2026-05-08,SC,JM Main Contractor,Main Contractor,Medium,working,ADMIN-SEC-02,2026-06-08
C-008,SCP Details for plinth - JM Main Contractor review,2026-05-08,GV,JM Main Contractor,Main Contractor,Medium,working,ADMIN-SEC-02,2026-06-08
C-009,Security model updates - JM MEP Consultant to update model with correct SCP details,2026-05-22,GV,JM MEP Consultant,MEP Consultant,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-22
C-010,EPED spurs cannot be de-energised - scope to be confirmed,2026-05-22,SC,JM Main Contractor,Main Contractor,Medium,working,ADMIN-SEC-02,2026-06-22
C-011,Earthing in Colo - frame for AC - multiple HRU and CRAC units need earthing schedule,2026-05-13,Commissioning Lead,Design Coordinator,Main Contractor,Critical,awaiting-input,COLO-EWS-01;COLO-EWS-02;COLO-HRU-01;COLO-HRU-02,2026-06-13
C-012,Co-ordination PNLs/UPMs - Power Sub deliverables not yet installed despite delivery 30+ days ago,2026-05-15,Commissioning Lead,Power PM,Power Sub,Critical,unowned,MER1-PNL-01;MER1-PNL-02;MER1-UPM-01;MER1-UPM-02,2026-06-15
C-013,Fire stop sign-off chain - who certifies cross-org installs?,2026-05-19,Commissioning Lead,,,High,unowned,ADMIN-FAS-01;ADMIN-FAS-02,2026-06-19
C-014,MER1 cable tray clash with structural beam at column grid G7,2026-05-14,Site Manager,Design Coordinator,Main Contractor,High,awaiting-input,MER1-CT-01;MER1-CT-02,2026-06-14
C-015,Robust Verification process delay - paperwork chain for red tag close-out not flowing,2026-05-08,Commissioning Lead,QA Engineer,Main Contractor,High,working,COLO-HRU-01;COLO-HRU-02;COLO-EWS-01,2026-06-08
C-016,Asbestos Check process adding 4-6 days to every red tag close-out cycle,2026-05-10,Commissioning Lead,Site Manager,Main Contractor,Medium,working,COLO-EWS-01;COLO-EWS-02,2026-06-10
C-017,Residual Verification PM - backlog of 9 items pending project manager sign-off,2026-05-11,Commissioning Lead,Commissioning Lead,Main Contractor,High,working,COLO-CRAC-03;COLO-EWSD-04;COLO-EWSD-05,2026-06-11
C-018,AHU red tag chain - Design Lead Rev D drawing 5 days overdue,2026-05-20,Site Manager,Design Coordinator,Main Contractor,Critical,awaiting-input,MER1-AHU-01;MER1-AHU-02;MER1-AHU-03,2026-06-20
C-019,Hyperscale Client witness sign-off slots not booked for July red tags,2026-05-22,Client Cx Manager,Client Cx Manager,Hyperscale Client,High,working,,2026-06-22
C-020,Generator commissioning sequence - Main Contractor and Power Sub handoff unclear,2026-05-21,Electrical Lead,,,High,unowned,MER1-GEN-01,2026-06-21
`;
