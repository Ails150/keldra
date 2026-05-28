// Embedded copies of the DUB-12 sample CSVs that live alongside this file
// (dub12-team-roster.csv / dub12-asset-register.csv / dub12-constraint-log.csv).
//
// Files under app/ aren't served statically by Next.js, so the "Load DUB-12
// sample" button can't fetch() the .csv files directly. These string exports
// are the runtime copy the button parses. Keep them in sync with the .csv
// files (those remain the canonical, human-readable artifacts).

export const DUB12_TEAM_CSV = `name,email,organisation,role,trade,deputy,phone
Johnny McKenna,johnny.mckenna@ardmac.com,Ardmac,Commissioning lead,M&E,Tom Walsh,+353871234567
Tom Walsh,tom.walsh@ardmac.com,Ardmac,Site supervisor,M&E,Johnny McKenna,+353871234568
Aoife Sheehan,aoife.sheehan@ardmac.com,Ardmac,QA engineer,M&E,Tom Walsh,+353871234569
Dermot Kelly,dermot.kelly@ardmac.com,Ardmac,Electrical lead,Electrical,Tom Walsh,+353871234570
Lawrence Burke,lawrence.burke@ardmac.com,Ardmac,Design lead,Containment,Niamh Boyle,+353871234571
Niamh Boyle,niamh.boyle@ardmac.com,Ardmac,Site engineer,Containment,Lawrence Burke,+353871234572
Cormac Doyle,cormac.doyle@ardmac.com,Ardmac,Drywall foreman,Drywall,Lawrence Burke,+353871234573
Conor Murphy,conor.murphy@centraldesign.com,Central Design,Engineer,Design,Eimear Healy,+353871234574
Eimear Healy,eimear.healy@centraldesign.com,Central Design,BIM coordinator,Design,Conor Murphy,+353871234575
Patrick O'Sullivan,patrick.osullivan@primopower.com,Primo Power,Project manager,Power,Sean Quinn,+353871234576
Sean Quinn,sean.quinn@primopower.com,Primo Power,Field engineer,Power,Patrick O'Sullivan,+353871234577
Sarah Kennedy,sarah.kennedy@primopower.com,Primo Power,Commissioning engineer,Power,Patrick O'Sullivan,+353871234578
David O'Brien,david.obrien@microsoft.com,Microsoft,Client witness,Client,Karen Lynch,+353871234579
Karen Lynch,karen.lynch@microsoft.com,Microsoft,Commissioning manager,Client,David O'Brien,+353871234580
`;

export const DUB12_ASSETS_CSV = `asset_id,asset_type,current_stage,owner_name,owner_org,location,system,red_tag_date,yellow_tag_date,green_date,notes,activity_id
MER1-AHU-01,Air Handling Unit,Red candidate,Tom Walsh,Ardmac,MER1 Main Electrical Room,Cooling,2026-05-15,,,Awaiting Rev D drawing from Lawrence,A1100
MER1-AHU-02,Air Handling Unit,Red candidate,Tom Walsh,Ardmac,MER1 Main Electrical Room,Cooling,2026-05-16,,,Awaiting Rev D drawing from Lawrence,A1110
MER1-AHU-03,Air Handling Unit,Red-tagged,Tom Walsh,Ardmac,MER1 Main Electrical Room,Cooling,2026-05-18,,,
MER1-CT-01,Cable Tray,Owner unclear,,,MER1 Main Electrical Room,Containment,2026-05-12,,,Clash with structural beam at column G7
MER1-CT-02,Cable Tray,Owner unclear,,,MER1 Main Electrical Room,Containment,2026-05-13,,,Clash with structural beam at column G7
MER1-CT-03,Cable Tray,Yellow,Lawrence Burke,Ardmac,MER1 Main Electrical Room,Containment,2026-05-08,2026-05-20,,
MER1-PNL-01,Distribution Panel,Delivered not installed,,Primo Power,MER1 Main Electrical Room,Power,2026-04-22,,,30+ days in warehouse - costing £8400/day,A1010
MER1-PNL-02,Distribution Panel,Delivered not installed,,Primo Power,MER1 Main Electrical Room,Power,2026-04-22,,,30+ days in warehouse - costing £8400/day,A1020
MER1-UPM-01,UPS Module,Yellow,Sean Quinn,Primo Power,MER1 Main Electrical Room,Power,2026-04-30,2026-05-15,,,A1030
MER1-UPM-02,UPS Module,Yellow,Sean Quinn,Primo Power,MER1 Main Electrical Room,Power,2026-04-30,2026-05-15,,
MER1-GEN-01,Generator,Designed,Dermot Kelly,Ardmac,MER1 Main Electrical Room,Power,,,,Commissioning sequence handoff unclear
COLO-EWSD-01,Electrical Distribution,Green,Dermot Kelly,Ardmac,Colo Hall 1,Power,2026-04-15,2026-04-28,2026-05-12,
COLO-EWSD-02,Electrical Distribution,Green,Dermot Kelly,Ardmac,Colo Hall 1,Power,2026-04-15,2026-04-28,2026-05-12,
COLO-EWSD-03,Electrical Distribution,Yellow,Dermot Kelly,Ardmac,Colo Hall 1,Power,2026-04-20,2026-05-08,,
COLO-EWSD-04,Electrical Distribution,Yellow,Dermot Kelly,Ardmac,Colo Hall 2,Power,2026-04-22,2026-05-10,,
COLO-EWSD-05,Electrical Distribution,Yellow,Dermot Kelly,Ardmac,Colo Hall 2,Power,2026-04-22,2026-05-10,,
COLO-CRAC-01,CRAC Unit,Green,Tom Walsh,Ardmac,Colo Hall 1,Cooling,2026-03-28,2026-04-15,2026-05-02,
COLO-CRAC-02,CRAC Unit,Green,Tom Walsh,Ardmac,Colo Hall 1,Cooling,2026-03-28,2026-04-15,2026-05-02,
COLO-CRAC-03,CRAC Unit,Yellow,Tom Walsh,Ardmac,Colo Hall 2,Cooling,2026-04-05,2026-05-01,,
COLO-EH-01,Electrical Heater,Yellow,Tom Walsh,Ardmac,Colo Hall 1,Power,2026-04-10,2026-05-05,,
COLO-EWS-01,Earthing System,Red-tagged,Tom Walsh,Ardmac,Colo Hall 1,Power,2026-05-08,,,Earthing in Colo - frame for AC,A2100
COLO-EWS-02,Earthing System,Red candidate,Tom Walsh,Ardmac,Colo Hall 2,Power,2026-05-12,,,Earthing in Colo - frame for AC
COLO-HRU-01,Heat Rejection Unit,Red candidate,Tom Walsh,Ardmac,Roof above Colo,Cooling,2026-05-15,,,,A2010
COLO-HRU-02,Heat Rejection Unit,Red candidate,Tom Walsh,Ardmac,Roof above Colo,Cooling,2026-05-15,,,,A2020
COLO-HRU-03,Heat Rejection Unit,Designed,Tom Walsh,Ardmac,Roof above Colo,Cooling,,,,
ADMIN-CWTS-01,Cold Water Treatment,Green,Sarah Kennedy,Primo Power,Admin Plant,Cooling,2026-03-15,2026-04-02,2026-04-20,
ADMIN-CWTS-02,Cold Water Treatment,Green,Sarah Kennedy,Primo Power,Admin Plant,Cooling,2026-03-15,2026-04-02,2026-04-20,
ADMIN-FAS-01,Fire Alarm System,Yellow,Patrick O'Sullivan,Primo Power,Admin Plant,Fire,2026-04-12,2026-05-05,,
ADMIN-FAS-02,Fire Alarm System,Yellow,Patrick O'Sullivan,Primo Power,Admin Plant,Fire,2026-04-12,2026-05-05,,
ADMIN-SEC-01,Security Panel,Red candidate,,Microsoft,Admin Plant,Security,2026-05-10,,,Awaiting Cundall security model update
ADMIN-SEC-02,Security Panel,Owner unclear,,,Admin Plant,Security,2026-05-12,,,Dog box scope - JM Ardmac to confirm
ADMIN-EH-01,Electrical Heater,Owner unclear,,,Admin Plant,Power,2026-05-08,,,
ADMIN-EH-02,Electrical Heater,Owner unclear,,,Admin Plant,Power,2026-05-08,,,
`;

export const DUB12_CONSTRAINTS_CSV = `id,description,raised_date,raised_by,owner_name,owner_org,priority,status,linked_assets,deadline
C-001,Exercise on what's included in security vendor scope vs not (e.g. locks not in security scope),2026-03-12,FL,JM Cundall,Cundall,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-12
C-002,Model review - Ardmac and Cundall coordination on security model updates,2026-03-12,MD,FL DEL,DEL,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-12
C-003,FoK list for security camera and card reader locations - federated model only 90% complete,2026-03-12,MD,GV Evolution,Evolution,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-12
C-004,FoK list to be provided by GV - issued 03/04/2026 but not received by Ardmac,2026-03-12,SC,GV Evolution,Evolution,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-12
C-005,Workshop on underground ducts with Ardmac/Cundall/Evolution/DEL,2026-04-10,DON,SC,Ardmac,Medium,working,ADMIN-SEC-01,2026-06-10
C-006,Power requirements for doors - GV Evolution to review,2026-04-10,SC,GV Evolution,Evolution,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-10
C-007,Dog box scope - JM Ardmac to confirm,2026-05-08,SC,JM Ardmac,Ardmac,Medium,working,ADMIN-SEC-02,2026-06-08
C-008,SCP Details for plinth - JM Ardmac review,2026-05-08,GV,JM Ardmac,Ardmac,Medium,working,ADMIN-SEC-02,2026-06-08
C-009,Security model updates - JM Cundall to update model with correct SCP details,2026-05-22,GV,JM Cundall,Cundall,Medium,working,ADMIN-SEC-01;ADMIN-SEC-02,2026-06-22
C-010,EPED spurs cannot be de-energised - scope to be confirmed,2026-05-22,SC,JM Ardmac,Ardmac,Medium,working,ADMIN-SEC-02,2026-06-22
C-011,Earthing in Colo - frame for AC - multiple HRU and CRAC units need earthing schedule,2026-05-13,Johnny McKenna,Lawrence Burke,Ardmac,Critical,awaiting-input,COLO-EWS-01;COLO-EWS-02;COLO-HRU-01;COLO-HRU-02,2026-06-13
C-012,Co-ordination PNLs/UPMs - Primo Power deliverables not yet installed despite delivery 30+ days ago,2026-05-15,Johnny McKenna,Patrick O'Sullivan,Primo Power,Critical,unowned,MER1-PNL-01;MER1-PNL-02;MER1-UPM-01;MER1-UPM-02,2026-06-15
C-013,Fire stop sign-off chain - who certifies cross-org installs?,2026-05-19,Johnny McKenna,,,High,unowned,ADMIN-FAS-01;ADMIN-FAS-02,2026-06-19
C-014,MER1 cable tray clash with structural beam at column grid G7,2026-05-14,Tom Walsh,Lawrence Burke,Ardmac,High,awaiting-input,MER1-CT-01;MER1-CT-02,2026-06-14
C-015,Robust Verification process delay - paperwork chain for red tag close-out not flowing,2026-05-08,Johnny McKenna,Aoife Sheehan,Ardmac,High,working,COLO-HRU-01;COLO-HRU-02;COLO-EWS-01,2026-06-08
C-016,Asbestos Check process adding 4-6 days to every red tag close-out cycle,2026-05-10,Johnny McKenna,Tom Walsh,Ardmac,Medium,working,COLO-EWS-01;COLO-EWS-02,2026-06-10
C-017,Residual Verification PM - backlog of 9 items pending project manager sign-off,2026-05-11,Johnny McKenna,Johnny McKenna,Ardmac,High,working,COLO-CRAC-03;COLO-EWSD-04;COLO-EWSD-05,2026-06-11
C-018,AHU red tag chain - Lawrence Rev D drawing 5 days overdue,2026-05-20,Tom Walsh,Lawrence Burke,Ardmac,Critical,awaiting-input,MER1-AHU-01;MER1-AHU-02;MER1-AHU-03,2026-06-20
C-019,Microsoft witness sign-off slots not booked for July red tags,2026-05-22,Karen Lynch,Karen Lynch,Microsoft,High,working,,2026-06-22
C-020,Generator commissioning sequence - Ardmac and Primo handoff unclear,2026-05-21,Dermot Kelly,,,High,unowned,MER1-GEN-01,2026-06-21
`;
