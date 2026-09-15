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
  week: "Week 1",
  bets: [
    { id: "w1-1", question: "Who scores more total points this week?", optionA: "Higher seed teams", optionB: "Lower seed teams" },
    { id: "w1-2", question: "Will any team break 150 points this week?", optionA: "Yes", optionB: "No" },
    { id: "w1-3", question: "Closest game of the week decided by...", optionA: "Under 10 points", optionB: "Over 10 points" },
    { id: "w1-4", question: "Will the highest-scoring team also win their matchup?", optionA: "Yes", optionB: "No" },
    { id: "w1-5", question: "Any team scores under 90 points?", optionA: "Yes", optionB: "No" },
    { id: "w1-6", question: "More upsets this week (projected underdog wins)?", optionA: "0-1 upsets", optionB: "2+ upsets" },
    { id: "w1-7", question: "Total combined league scoring this week vs. last week?", optionA: "Higher", optionB: "Lower" },
    { id: "w1-8", question: "Which position group has the highest single output?", optionA: "RB", optionB: "WR" },
    { id: "w1-9", question: "Will there be a waiver-wire pickup that outscores a starter?", optionA: "Yes", optionB: "No" },
    { id: "w1-10", question: "Biggest blowout margin this week?", optionA: "Under 30 points", optionB: "30+ points" },
    { id: "w1-11", question: "Will the current last-place team win this week?", optionA: "Yes", optionB: "No" },
    { id: "w1-12", question: "Does any QB throw for 4+ TDs across the league?", optionA: "Yes", optionB: "No" }
  ]
};
