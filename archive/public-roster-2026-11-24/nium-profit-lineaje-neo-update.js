(() => {
  const eventById = (eventId) => (window.LVPT_LIVE_EVENTS || []).find((event) => event.id === eventId);

  const nium = eventById('evt-nium-2026');
  if (nium) {
    Object.assign(nium, {
      status: 'Deposit Paid',
      probabilityToClose: 100,
      knownRisks: 'Deposit has been received by ACH. Palms Place rental cost, casino package cost, poker pro budget, catering/open bar budget, and transportation budget are now mapped. Remaining execution items: secure/confirm Palms Place, select the poker pro, finalize catering/open bar details, finalize transportation through Mark, collect remaining 40% balance, and approve branded asset proofs.',
      nextAction: 'Show Mark the updated NIUM revenue, cost, deposit, and projected profit breakdown; then secure Palms Place and finalize remaining vendor production steps.',
      nextActionDue: '2026-08-06',
    });

    nium.payment = {
      ...nium.payment,
      amountPaid: 30347.03,
      depositRequired: 30347.03,
      status: 'Deposit Paid by ACH',
      balanceDueDate: '2026-09-19',
    };

    nium.setup = {
      ...nium.setup,
      planningStage: 'Deposit Paid / Production Started',
      venueStatus: 'Deposit Received — Secure Palms Place',
      paymentNotes: 'NIUM paid the 60% deposit by ACH. Amount received: $30,347.03. No card-processing fee was deducted. Remaining 40% balance: $20,231.35 due September 19, 2026. PO #6441 and invoice INV-000839 are the active purchasing documents.',
      productionNotes: 'Confirmed client-facing event total is $50,578.38. Projected hard costs are $31,025.00. Projected profit is $19,553.38 before owner draws, internal overhead, and income taxes. Transportation through Mark is budgeted at $5,400 and will more than likely come out of the second/final payment.',
      complianceNotes: '3.5% line was included to cover possible credit card transactions. Because NIUM paid by ACH, the $1,710.38 processing/service reserve is treated as retained margin unless later reclassified.',
      miscNotes: 'Partner profit view: revenue $50,578.38; costs $7,500 Palms Place + $8,125 casino package + $1,500 poker pro + $8,500 catering/open bar + $5,400 transportation = $31,025.00; projected profit $19,553.38; projected margin 38.66%. Casino package cost includes tables, 5 dealers, custom NIUM chips, custom NIUM cards, custom NIUM felts, chip racks/case, setup, and tear-down.',
    };

    nium.quote = [
      { id: id(), category: 'Venue', name: '59th Floor Palms Place Villa / Penthouse', quantity: 1, unitPrice: 10800.00, internalCost: 7500.00 },
      { id: id(), category: 'Casino', name: 'NIUM Casino Package — tables, 5 dealers, custom chips/cards/felts, setup/tear-down', quantity: 1, unitPrice: 12198.00, internalCost: 8125.00 },
      { id: id(), category: 'Training', name: 'World-Class Poker Pro Hand Analysis — 3 hours, pro TBD', quantity: 1, unitPrice: 4000.00, internalCost: 1500.00 },
      { id: id(), category: 'Food & Beverage', name: 'Premium Catering + Open Bar Service', quantity: 1, unitPrice: 12150.00, internalCost: 8500.00 },
      { id: id(), category: 'Transportation', name: 'One-Way Click-and-Ride / Pick-Me-Up / SUV Arrival Support via Mark', quantity: 1, unitPrice: 9720.00, internalCost: 5400.00 },
      { id: id(), category: 'Processing Reserve', name: '3.5% credit-card processing / service reserve — paid by ACH, retained', quantity: 1, unitPrice: 1710.38, internalCost: 0.00 },
    ];

    nium.compliance = [
      { id: id(), name: 'NIUM Zip event approval', status: 'Complete', dueDate: '2026-07-27' },
      { id: id(), name: 'NIUM PO #6441 received', status: 'Complete', dueDate: '2026-07-28' },
      { id: id(), name: 'Vendor onboarding and bank-verification requirements', status: 'Complete', dueDate: '2026-07-30' },
      { id: id(), name: '60% ACH deposit received — $30,347.03', status: 'Complete', dueDate: '2026-08-05' },
      { id: id(), name: 'Palms Place rental cost mapped — $7,500', status: 'Complete', dueDate: '2026-08-05' },
      { id: id(), name: 'Casino package cost mapped — $8,125 inclusive of dealers/custom assets', status: 'Complete', dueDate: '2026-08-05' },
      { id: id(), name: 'Poker pro budget mapped — $1,500 for 3 hours, pro TBD', status: 'Complete', dueDate: '2026-08-05' },
      { id: id(), name: 'Catering/open bar budget mapped — $8,500', status: 'Complete', dueDate: '2026-08-05' },
      { id: id(), name: 'Transportation budget mapped — $5,400 through Mark', status: 'Complete', dueDate: '2026-08-05' },
      { id: id(), name: 'Remaining 40% balance — $20,231.35', status: 'Needed', dueDate: '2026-09-19' },
    ];

    nium.tasks = [
      { id: id(), title: 'Show Mark NIUM projected profit breakdown and draw/cash-flow position', owner: 'Matt', dueDate: '2026-08-06', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Secure / confirm Palms Place rental now that deposit has hit', owner: 'Matt', dueDate: '2026-08-06', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Select and confirm the 3-hour poker pro', owner: 'Matt', dueDate: '2026-08-14', priority: 'High', status: 'Open' },
      { id: id(), title: 'Finalize catering and open bar direction inside the $8,500 budget', owner: 'Matt', dueDate: '2026-08-21', priority: 'High', status: 'Open' },
      { id: id(), title: 'Finalize one-way Pick-Me-Up / SUV transportation through Mark', owner: 'Matt', dueDate: '2026-09-01', priority: 'High', status: 'Open' },
      { id: id(), title: 'Collect dietary restrictions, allergies, and the executive drink preference', owner: 'Matt', dueDate: '2026-08-28', priority: 'High', status: 'Open' },
      { id: id(), title: 'Send custom chip, card, and felt proofs to Eli for final sign-off', owner: 'Matt', dueDate: '2026-09-04', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Collect remaining 40% balance of $20,231.35', owner: 'Matt', dueDate: '2026-09-19', priority: 'Critical', status: 'Open' },
      { id: id(), title: 'Upload INV-000839, PO #6441, deposit confirmation, and final vendor documents to the event vault', owner: 'Matt', dueDate: '2026-08-08', priority: 'Medium', status: 'Open' },
    ];
  }

  const lineaje = eventById('evt-lineaje-2026');
  if (lineaje) {
    Object.assign(lineaje, {
      status: 'Completed',
      probabilityToClose: 100,
      knownRisks: 'Event completed. No active pre-event risks remain. Move only post-event notes, photos/video, client feedback, review request, and rebooking opportunity forward if desired.',
      nextAction: 'Closed out after successful event. No overdue pre-event notifications should remain.',
      nextActionDue: '',
    });

    lineaje.setup = {
      ...lineaje.setup,
      planningStage: 'Completed / Closed',
      venueStatus: 'Completed',
      paymentNotes: 'Client payment was paid in full. Event has been completed and should no longer generate pre-event overdue notifications.',
      productionNotes: 'Lineaje event ran the weekend of August 3, 2026 at The Venetian / Palazzo side. Close pre-event production workflow and retain only post-event follow-up items as needed.',
      complianceNotes: 'All pre-event compliance and production items are closed for notification purposes.',
      communicationNotes: 'No active pre-event communications required. Optional post-event thank-you, media follow-up, review request, and rebooking nurture may be handled separately.',
    };

    lineaje.compliance = [
      { id: id(), name: 'Lineaje invoice / event agreement paid in full', status: 'Complete', dueDate: '2026-07-15' },
      { id: id(), name: 'Venetian paperwork and event authorization', status: 'Complete', dueDate: '2026-07-29' },
      { id: id(), name: 'Venetian venue/payment workflow', status: 'Complete', dueDate: '2026-08-03' },
      { id: id(), name: 'Event completed and closed for pre-event notifications', status: 'Complete', dueDate: '2026-08-03' },
    ];

    lineaje.tasks = [
      { id: id(), title: 'Lineaje event completed — close pre-event notification workflow', owner: 'Matt', dueDate: '2026-08-03', priority: 'Critical', status: 'Complete' },
      { id: id(), title: 'Archive final Lineaje paperwork and receipts if not already uploaded', owner: 'Matt', dueDate: '2026-08-08', priority: 'Medium', status: 'Complete' },
    ];

    lineaje.postEvent = {
      ...lineaje.postEvent,
      whatWentWell: lineaje.postEvent?.whatWentWell || 'Event ran successfully at The Venetian / Palazzo side and is now closed from the active pre-event tracker.',
      changesForNextTime: lineaje.postEvent?.changesForNextTime || 'Keep venue payment confirmation, arrival instructions, bar timing, and pro confirmations locked earlier to reduce last-week notifications.',
      reviewRequested: false,
      reviewReceived: false,
      rebookingLikelihood: 'High',
    };
  }

  const neo = eventById('evt-neo-reunion-2026');
  if (neo) {
    Object.assign(neo, {
      status: 'Proposal Sent',
      probabilityToClose: 80,
      nextAction: 'Send April the updated NEO 2026 proposal today and follow up for approval, timing, floor plan, and deposit-invoice direction.',
      nextActionDue: '2026-08-05',
    });

    neo.setup = {
      ...neo.setup,
      planningStage: 'Updated Proposal Being Sent',
      communicationNotes: 'Matt is sending April the updated NEO 2026 proposal on August 5, 2026. Follow-up should focus on approval, event timing, floor plan, training scope, and the 90% deposit invoice path.',
      paymentNotes: 'Updated proposal is being sent to April. 90% deposit invoice should be issued after approval or as directed by Mosaic.',
    };

    const existingTitles = new Set((neo.tasks || []).map((task) => task.title));
    const sendProposalTask = 'Send April the updated NEO 2026 proposal';
    if (!existingTitles.has(sendProposalTask)) {
      neo.tasks = [
        { id: id(), title: sendProposalTask, owner: 'Matt', dueDate: '2026-08-05', priority: 'Critical', status: 'Open' },
        ...(neo.tasks || []),
      ];
    }
  }
})();
