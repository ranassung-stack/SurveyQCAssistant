const TEST_DATA = [

{
    name: "Single Select",

    input: `
Q1_HS. Which of the following best describes your current living situation? Please select one response.

[RANDOMIZE]

1. Renting on my own
2. Renting with roommates
3. Renting with a spouse/partner
4. Other (please specify) [ANCHOR]
`
},

{
    name: "Grid",

    input: `
Q1_MTVN. How important, if at all, are the following reasons in your decision to buy a home? Please select one response for each reason.
[ROWS. RANDOMIZE]
1. Build wealth over time
2. Have a stable monthly payment
3. Stop paying rent to a landlord

[COLUMNS]
1. Very important
2. Somewhat important
3. Neutral
4. Not very important
5. Not at all important
`
},

{
    name: "Recode",

    input: `
S5_recode. Income Recode

1. Under $25,000 [S5=1]
2. $25,000-$49,999 [S5=2]
3. Prefer not to say
`
}

{
	name: "Multi",
	input: ` 
Q4_AFDB_N. Is there anything about your homebuying journey that you feel the professionals you talk to haven't asked about? Please select all that apply.
[RANDOMIZE]
1.	The emotional stress and mental health toll of trying to buy
2.	How hard it is to compete against cash buyers or investors
3.	The lack of honest, non-salesy information available
4.	How isolated the process feels — like you're figuring it out alone
5.	The difficulty of saving while also dealing with inflation and cost of living
7.  Other (please specify) [ANCHOR]
6.	Nothing — this survey covered the important topics [ANCHOR, EXCLUSIVE]
`
}
];