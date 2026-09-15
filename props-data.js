/* ============================================================
   WEEKLY PROP BETS
   ------------------------------------------------------------
   Edit this file once a week. Ask Claude something like:

     "Here are this week's Tnaat Dynasty matchups: [list them].
      Give me 12 fun prop bets as a JS array in this exact format:
      { id, question, optionA, optionB }"

   Then paste the array below, replacing the example ones.
   IMPORTANT: each "id" must be unique PER WEEK (e.g. include the
   week number in it) or old votes will carry over into new bets.
   ============================================================ */
window.WEEKLY_PROPS = {
  week: "Week 2",
  bets: [
    { id: "w2-1", question: "Who scores more total points this week?", optionA: "Higher seed teams", optionB: "Lower seed teams" },
    { id: "w2-2", question: "Will any team break 150 points this week?", optionA: "Yes", optionB: "No" },
    { id: "w2-3", question: "Closest game of the week decided by...", optionA: "Under 10 points", optionB: "Over 10 points" },
    { id: "w2-4", question: "Will the highest-scoring team also win their matchup?", optionA: "Yes", optionB: "No" },
    { id: "w2-5", question: "Does any team score under 90 points?", optionA: "Yes", optionB: "No" },
    { id: "w2-6", question: "More upsets this week (projected underdog wins)?", optionA: "0-1 upsets", optionB: "2+ upsets" },
    { id: "w2-7", question: "Total combined league scoring vs. Week 1?", optionA: "Higher", optionB: "Lower" },
    { id: "w2-8", question: "Which position group posts the highest single output?", optionA: "RB", optionB: "WR" },
    { id: "w2-9", question: "Does a waiver-wire pickup outscore a starter somewhere in the league?", optionA: "Yes", optionB: "No" },
    { id: "w2-10", question: "Biggest blowout margin this week?", optionA: "Under 30 points", optionB: "30+ points" },
    { id: "w2-11", question: "Does the current last-place team win this week?", optionA: "Yes", optionB: "No" },
    { id: "w2-12", question: "Does any QB throw for 4+ TDs across the league?", optionA: "Yes", optionB: "No" }
  ]
};
