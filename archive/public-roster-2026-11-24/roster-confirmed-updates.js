(() => {
  const eventById = (eventId) => (window.LVPT_LIVE_EVENTS || []).find((event) => event.id === eventId);

  const lineaje = eventById('evt-lineaje-2026');
  if (lineaje) {
    Object.assign(lineaje, {
      guestCount: 20,
      studentCount: 20,
      status: 'Pre-Production',
      knownRisks: 'A third poker professional still needs to be confirmed; final Palazzo-side parking, arrival, and check-in instructions are pending; Venetian credit-card information has been submitted, but the final charge receipt should still be retained.',
      nextAction: 'Obtain the final Palazzo arrival and parking instructions, then send Destine one combined update confirming the approved 3:50 PM bar start and guest check-in details.',
      nextActionDue: '2026-07-30',
    });
    lineaje.setup = {
      ...lineaje.setup,
      venueStatus: 'Confirmed — Venue Payment Submitted',
      setupTime: '15:30',
      strikeTime: '18:15',
      parkingInstructions: 'Final Palazzo-side parking, arrival, and check-in instructions still need to be obtained from The Venetian and sent to Destine with the 3:50 PM bar-start confirmation.',
      foodPlan: 'Two-hour premium open bar approved to begin at approximately 3:50 PM during guest arrival. No food service included.',
      productionNotes: 'Venetian credit-card information has been submitted. Kenna James and Jeff Madsen are confirmed; the third pro remains open. All LVPT pros should arrive at approximately 3:50 PM.',
      paymentNotes: 'Invoice INV-000838 was paid in full on July 15, 2026. Client payment is complete. Venetian credit-card information has now been submitted; retain final payment confirmation or receipt when available.',
      communicationNotes: 'Send Destine one combined update confirming the approved 3:50 PM drinking start and the final Palazzo-side parking, arrival, and check-in instructions.',
      miscNotes: 'Operational attendance is 20 total participants in the experience. The original invoice referenced 25 total attendees, but the current working count is 20 participants.',
    };
    lineaje.staff = [
      { id: id(), name: 'Kenna James', role: 'Lead Poker Pro / Instructor', confirmed: true, arrivalTime: '15:50', rate: 0 },
      { id: id(), name: 'Jeff Madsen', role: 'Poker Pro / Instructor', confirmed: true, arrivalTime: '15:50', rate: 0 },
      { id: id(), name: 'Third Poker Pro TBD', role: 'Poker Pro / Instructor', confirmed: false, arrivalTime: '15:50', rate: 0 },
      { id: id(), name: 'Venetian Dealer Team — 3', role: 'Poker Dealers', confirmed: true, arrivalTime: '15:45', rate: 0 },
      { id: id(), name: 'Venetian Bar Team', role: '1 Bartender + 2 Beverage Servers', confirmed: true, arrivalTime: '15:40', rate: 0 },
    ];
    lineaje.compliance = [
      { id: id(), name: 'Lineaje invoice / event agreement paid in full', status: 'Complete', dueDate: '2026-07-15' },
      { id: id(), name: 'Venetian Hospitality Event Order and CC authorization returned', status: 'Complete', dueDate: '2026-07-29' },
      { id: id(), name: 'Venetian credit-card information submitted', status: 'Complete', dueDate: '2026-07-30' },
      { id: id(), name: '3:50 PM premium-bar service approval', status: 'Complete', dueDate: '2026-07-30' },
      { id: id(), name: 'Final Palazzo arrival and parking instructions', status: 'Pending', dueDate: '2026-07-30' },
    ];
    lineaje.tasks = [
      { id: id(), title: 'Get final Palazzo parking, arrival, and check-in instructions from The Venetian', owner: 'Matt', dueDate: '2026-07-30', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Email Destine the approved 3:50 PM bar start plus Palazzo arrival instructions', owner: 'Matt', dueDate: '2026-07-30', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Confirm the third world-class poker pro / instructor', owner: 'Matt', dueDate: '2026-07-31', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Retain Venetian venue-charge confirmation or receipt', owner: 'Matt', dueDate: '2026-07-31', priority: 'High', status: 'Open' },
      { id: id(), title: 'Upload INV-000838 and final Venetian paperwork to the event document vault', owner: 'Matt', dueDate: '2026-07-30', priority: 'Medium', status: 'Open' },
    ];
  }

  const neo = eventById('evt-neo-reunion-2026');
  if (neo) {
    Object.assign(neo, {
      status: 'Proposal Sent',
      probabilityToClose: 75,
      eventFormat: 'Tournament-only production for approximately 250 players with 24 professional poker tables, 26 dealers, a Tournament Director, Kenna James as MC, registration support, and final-table management. No LVPT poker-training session is included this year.',
      knownRisks: 'Mosaic previously indicated LVPT would be included, but April has not reconfirmed since the most recent event concluded. The final proposal is not yet approved; no final deposit invoice has been issued or paid; tournament timing, setup access, floor plan, and custom chips/cards remain pending.',
      nextAction: 'Follow up with April for final approval, tournament timing, setup access, floor-plan details, and confirmation of whether custom chips and cards should be included on the invoice.',
      nextActionDue: '2026-07-31',
    });
    neo.setup = {
      ...neo.setup,
      invoiceEmail: 'AThompson@mosaicevents.com',
      planningStage: 'Awaiting Final Client Confirmation',
      poRequired: 'no',
      venueStatus: 'Date Previously Confirmed — Final Scope Pending',
      travelNeeds: 'Mosaic will cover directly or reimburse dealer, MC/pro, Tournament Director, and event-support travel, hotel rooms, ground transportation, and per diem.',
      trainingFormat: 'No Training',
      addOns: 'Custom chips and cards are pending confirmation for inclusion on the invoice. No VIP bounty or other optional enhancements are currently expected.',
      layoutNotes: 'Tournament-only floor plan for 24 professional poker tables in the Tortolita Ballroom & Terrace. Updated floor-plan layout and setup access time are still pending from Mosaic / the venue.',
      productionNotes: 'No LVPT training session this year. Tournament start/end times remain open. Breakdown can occur progressively as tables close; last year there was no hard out, but any venue deadline still needs confirmation.',
      paymentNotes: 'The final version has not yet been approved. No final 90% deposit invoice has been issued or paid. April is expected to remain the payment contact. No PO is required because LVPT is already an approved Mosaic vendor.',
      communicationNotes: 'Waiting on April to confirm the final proposal, tournament schedule, setup access, floor plan, and custom chip/card scope.',
      miscNotes: 'Mosaic appears to be handling any attendee training internally. LVPT scope is the tournament only. Executive/VIP bounty feature is not expected.',
    };
    neo.compliance = [
      { id: id(), name: 'Mosaic approved-vendor status', status: 'Complete', dueDate: '' },
      { id: id(), name: 'Final proposal approval and 90% deposit invoice', status: 'Needed', dueDate: '2026-08-07' },
      { id: id(), name: 'Updated tournament floor plan and setup access', status: 'Pending', dueDate: '2026-08-14' },
      { id: id(), name: 'Custom chips and cards scope confirmation', status: 'Pending', dueDate: '2026-08-14' },
      { id: id(), name: 'Certificate of Insurance / venue packet', status: 'Pending', dueDate: '2026-08-19' },
      { id: id(), name: 'Kenna / onsite personnel agreements and NDAs if required', status: 'Pending', dueDate: '2026-09-04' },
      { id: id(), name: 'Final 10% payment', status: 'Needed', dueDate: '2026-09-19' },
    ];
    neo.tasks = [
      { id: id(), title: 'Follow up with April for final NEO approval', owner: 'Matt', dueDate: '2026-07-31', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Confirm tournament start/end times and setup access', owner: 'Matt', dueDate: '2026-08-07', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Receive the updated tournament floor-plan layout', owner: 'Matt', dueDate: '2026-08-14', priority: 'High', status: 'Open' },
      { id: id(), title: 'Confirm custom chips and cards for the final invoice', owner: 'Matt', dueDate: '2026-08-14', priority: 'High', status: 'Open' },
      { id: id(), title: 'Update the final proposal and issue the 90% deposit invoice after approval', owner: 'Matt', dueDate: '2026-08-08', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Document Mosaic travel, hotel, ground, and per-diem reimbursement process', owner: 'Matt', dueDate: '2026-08-21', priority: 'High', status: 'Open' },
      { id: id(), title: 'Confirm venue breakdown deadline or flexible table-by-table strike plan', owner: 'Matt', dueDate: '2026-09-04', priority: 'High', status: 'Open' },
      { id: id(), title: 'Complete any required personnel agreements and NDAs', owner: 'Matt', dueDate: '2026-09-04', priority: 'High', status: 'Open' },
      { id: id(), title: 'Collect final 10% payment', owner: 'Matt', dueDate: '2026-09-19', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Upload the NEO 2026 proposal to the event document vault', owner: 'Matt', dueDate: '2026-07-30', priority: 'Medium', status: 'Open' },
    ];
  }

  const nium = eventById('evt-nium-2026');
  if (nium) {
    Object.assign(nium, {
      guestCount: 60,
      status: 'Invoice Sent',
      knownRisks: 'The $30,347.03 deposit has not been received, so Palms Place cannot be formally secured. Catering selection, menu details, dietary restrictions, the executive drink preference, and branded chip/card/felt approvals remain open.',
      nextAction: 'Obtain NIUM’s deposit timing, then secure Palms Place and begin catering, branded-asset, and one-way transportation production.',
      nextActionDue: '2026-07-31',
    });
    nium.setup = {
      ...nium.setup,
      planningStage: 'Approved / Awaiting Deposit',
      venueStatus: 'Awaiting Client Deposit',
      venueContact: "Streeter's Palms Place contact — name pending",
      parkingInstructions: 'Transportation is one-way to the event only using Sprinter vans and SUVs. No return transportation and no party bus. Pickup addresses will be submitted individually by guests through the custom app.',
      travelNeeds: 'Plan the one-way arrival fleet for up to 60 participants. Guests will confirm their own pickup locations through the app rather than using fixed group pickup points.',
      foodPlan: 'Premium catering and open bar are included, but caterer selection and menu work will begin only after the deposit is received. Cut & Taste and Art of Cooking remain under consideration. Dietary restrictions, allergies, and the executive drink preference are still unknown.',
      productionNotes: 'All 60 participants are confirmed for the experience. Transportation remains one-way only via Sprinter vans and SUVs. Eli will provide final approval on custom chips, cards, and table-felt artwork.',
      paymentNotes: 'Invoice INV-000839 for $50,578.38 is already in the NIUM / Zip system and currently shows as pending. It was not resubmitted while pending. PO #6441 has been received and should be added if NIUM requests an updated or resubmitted invoice. Deposit of $30,347.03 has not been received.',
      complianceNotes: 'All requested NIUM / Zip vendor-onboarding and bank-verification requirements have been completed. Monitor the pending invoice and confirm whether AP requires a PO-referenced resubmission.',
      communicationNotes: 'A payment-status message has been sent and a response is pending. Begin venue, catering, transportation, and branded-asset production after deposit confirmation.',
      miscNotes: 'Attendance is confirmed at 60 participants. Final pickup locations will be supplied by participants through the transportation app. Eli Menaker is the final approver for chips, cards, and table-felt artwork.',
    };
    nium.payment = {
      ...nium.payment,
      amountPaid: 0,
      status: 'Awaiting Deposit',
    };
    nium.compliance = [
      { id: id(), name: 'NIUM Zip event approval', status: 'Complete', dueDate: '2026-07-27' },
      { id: id(), name: 'NIUM PO #6441 received', status: 'Complete', dueDate: '2026-07-28' },
      { id: id(), name: 'Vendor onboarding and bank-verification requirements', status: 'Complete', dueDate: '2026-07-30' },
      { id: id(), name: 'INV-000839 pending in NIUM / Zip system', status: 'Monitoring', dueDate: '2026-07-31' },
      { id: id(), name: '60% deposit received and venue secured', status: 'Needed', dueDate: '2026-07-31' },
      { id: id(), name: 'Remaining 40% balance', status: 'Needed', dueDate: '2026-09-19' },
    ];
    nium.tasks = [
      { id: id(), title: 'Follow up on the $30,347.03 NIUM deposit and expected payment date', owner: 'Matt', dueDate: '2026-07-31', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Confirm whether AP requires INV-000839 to be resubmitted with PO #6441', owner: 'Matt', dueDate: '2026-07-31', priority: 'High', status: 'Open' },
      { id: id(), title: 'Secure the Palms Place villa immediately after deposit receipt', owner: 'Matt', dueDate: '2026-08-01', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Select Cut & Taste or Art of Cooking after payment', owner: 'Matt', dueDate: '2026-08-21', priority: 'High', status: 'Open' },
      { id: id(), title: 'Collect dietary restrictions, allergies, and the executive drink preference', owner: 'Matt', dueDate: '2026-08-28', priority: 'High', status: 'Open' },
      { id: id(), title: 'Send custom chip, card, and felt proofs to Eli for final sign-off', owner: 'Matt', dueDate: '2026-09-04', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Configure the app for up to 60 individual pickup-location confirmations', owner: 'Matt', dueDate: '2026-09-21', priority: 'High', status: 'Open' },
      { id: id(), title: 'Confirm final Sprinter van and SUV fleet based on app submissions', owner: 'Matt', dueDate: '2026-09-28', priority: 'High', status: 'Open' },
      { id: id(), title: 'Collect remaining 40% balance', owner: 'Matt', dueDate: '2026-09-19', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Upload INV-000839, PO #6441, and final vendor documents to the event vault', owner: 'Matt', dueDate: '2026-07-30', priority: 'Medium', status: 'Open' },
    ];
  }
})();
