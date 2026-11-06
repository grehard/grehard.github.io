// First-run notes: the working notebook of a graduate student writing a thesis on
// buried urban rivers. The city, river, sources and people are all invented.
(function (MG) {
  'use strict';

  const DAY = 86400000;

  const FOLDERS = [
    { id: 'f_thesis', name: 'Thesis' },
    { id: 'f_reading', name: 'Reading' },
    { id: 'f_field', name: 'Field notes' },
    { id: 'f_essays', name: 'Essays' },
    { id: 'f_admin', name: 'Admin' },
  ];

  const NOTES = [
    {
      id: 'n_outline', title: 'Thesis outline', folder: 'f_thesis', pinned: true, age: 0.1, created: 94,
      body: `Working title: **What the water left**. How residents of Aldermouth remember a river the city buried in 1934.

## Argument

Flood memory outlasts the river itself. Streets keep *the behaviour* of water long after the water is gone, and residents read those signs better than the drainage maps do.

## Structure

1. Introduction and the case of Marlow Creek
2. [[Chapter 2: Buried rivers]]
   - Engineering history, 1880 to 1934
   - The culvert as a political object, after [[Reading: Culvert Politics]]
3. [[Chapter 3: Flood memory]]
   - Oral histories from [[Interview: Tessel Street residents]]
   - Archive against testimony, using [[Flood records 1931-1987]]
4. Daylighting and what it would restore
5. Conclusion

## Before the December review

- [x] Finish the second round of interviews
- [x] Clean the flood records table
- [ ] Redraft the chapter 3 opening
- [ ] Send the methods section to [[Supervisor meetings]]
- [ ] Decide whether [[Daylighting costs]] gets its own section

#thesis #planning`,
    },
    {
      id: 'n_ch2', title: 'Chapter 2: Buried rivers', folder: 'f_thesis', age: 1.2, created: 71,
      body: `## Opening

Marlow Creek did not disappear in a single decision. It went underground one block at a time between 1881 and 1934, usually after a complaint about smell and always before an election.

> A culvert is an argument that has been won, then paved over.
> -- [[Reading: Culvert Politics]], p. 41

## Sections to write

- The 1881 tannery petition
- The Tessel Street extension, and why it was built two metres too shallow
  - Compare the survey with [[Site visit: Marlow Creek outfall]]
  - Inspector's account in [[Interview: retired culvert inspector|the Ostrowe interview]]
- Who paid: the ward assessment rolls

## Terms

See [[Glossary]] for *culverting* and *daylighting*. Halloran's phrase "the second city" comes from [[Reading: Rivers Under the City]].

#thesis #history #culverts`,
    },
    {
      id: 'n_ch3', title: 'Chapter 3: Flood memory', folder: 'f_thesis', age: 0.4, created: 58,
      body: `## The problem

The official record lists **eleven** flood events on Tessel Street between 1931 and 1987. Residents I spoke to could describe at least **nineteen**. That gap is the chapter.

Three things seem to carry memory better than archives do:

1. Thresholds raised by a step, with no reason given to new owners
2. Family rules, such as *never keep photographs in the cellar*
3. The shared habit of watching one particular drain

## Evidence

| Source | Events named | Earliest | Reliability |
| --- | :---: | :---: | --- |
| [[Flood records 1931-1987]] | 11 | 1931 | Exact dates, silent on small floods |
| [[Interview: Tessel Street residents]] | 19 | 1946 | Vivid, dates drift by years |
| Parish newsletter | 6 | 1952 | Only floods that reached the hall |

The method for weighing these is in [[Methods: oral history]]. Tamsin Arkwright's framing in [[Reading: The Archive and the Flood]] helps here, though she underrates family rules.

#thesis #memory #flooding`,
    },
    {
      id: 'n_methods', title: 'Methods: oral history', folder: 'f_thesis', age: 6, created: 80,
      body: `## Approach

Semi-structured interviews of 60 to 90 minutes, held at the participant's home so that they can point at things. Walking interviews where mobility allows.

## Ethics

- [x] Consent forms approved by the review panel
- [x] Pseudonyms for all participants
- [ ] Return transcripts to participants for correction

## Prompts that worked

- "Show me where the water came to."
- "Who told you not to do that?"
- "What did the street smell like the day after?"

Keep questions about dates to the end. Asking early makes people defensive, and see [[Chapter 3: Flood memory]] for why precise dates matter less than sequence.

#methods #interviews`,
    },
    {
      id: 'n_rivers', title: 'Reading: Rivers Under the City', folder: 'f_reading', pinned: true, age: 12, created: 88,
      body: `**M. Halloran**, *Rivers Under the City*, Northgate University Press, 2011.

## Summary

A survey of forty buried rivers across three continents. Strongest on engineering and finance, weakest on anyone who lived above the pipes.

## Useful claims

- Burial was almost always sold as public health, then paid for by property uplift (ch. 2)
- "The second city": the network of old watercourses that still decides where basements flood (ch. 5)
- Culverts built before 1920 were sized for rainfall records that were already out of date

## Where I disagree

Halloran treats memory as nostalgia. My evidence in [[Chapter 3: Flood memory]] suggests it works more like local engineering knowledge.

#reading #history`,
    },
    {
      id: 'n_archive', title: 'Reading: The Archive and the Flood', folder: 'f_reading', age: 15, created: 76,
      body: `**T. Arkwright**, *The Archive and the Flood*, Eastmere Press, 2018.

An argument that municipal flood records measure insurance exposure, not water. A flood that wet no insured property did not, for the record, happen.

> The ledger is dry long before the street is.

## For the thesis

- Explains the gap in [[Flood records 1931-1987]]
- Pairs with the threshold evidence from [[Interview: Tessel Street residents]]
- Her method section is a good model for [[Methods: oral history]]

#reading #memory #archives`,
    },
    {
      id: 'n_culvert', title: 'Reading: Culvert Politics', folder: 'f_reading', age: 20, created: 79,
      body: `**J. Bremner and L. Oduya**, "Culvert Politics: Drainage and the Ward System, 1870-1940", *Journal of Municipal History* 34 (2), 2016.

## Key points

- Drainage contracts tracked ward loyalty more closely than flood risk
- Maps of culvert extensions and election years line up with little else needed
- Short on sources after 1940

## Quotes

> A culvert is an argument that has been won, then paved over. (p. 41)

Useful for [[Chapter 2: Buried rivers]], and worth checking the ward numbers against the rolls.

#reading #culverts #history`,
    },
    {
      id: 'n_inspector', title: 'Interview: retired culvert inspector', folder: 'f_field', age: 9, created: 40,
      body: `**Participant:** "Ostrowe" (pseudonym), inspected the eastern culverts for 31 years.
**Where:** his kitchen, then the Tessel Street manhole.

## Notes

He still walks the line after heavy rain. Says the 1934 section has a "belly" near number 42 where silt settles, and that every inspector knew it and none of them wrote it down.

> You don't report a thing they can't afford to fix.

## Follow up

- [ ] Ask for the name of the 1961 foreman
- [x] Photograph his hand-drawn section sketch
- [ ] Check the belly location against [[Site visit: Marlow Creek outfall]]

Goes into [[Chapter 2: Buried rivers]].

#interviews #culverts`,
    },
    {
      id: 'n_residents', title: 'Interview: Tessel Street residents', folder: 'f_field', age: 3, created: 34,
      body: `Group interview at number 18, with four neighbours aged 58 to 91.

## What they named

- The "Whitsun water", which they all place around 1958
- A flood nobody can date, when the hall's piano floated
- Number 26's raised step, which was added by a grandfather and is never explained to buyers

## Threshold survey

| House | Step height (cm) | Added by | Reason given |
| ---: | ---: | --- | --- |
| 18 | 22 | Unknown | "It's always been there" |
| 26 | 31 | Grandfather, c. 1947 | "For the water" |
| 42 | 38 | Previous owner | None |

These thresholds are the best physical evidence in [[Chapter 3: Flood memory]]. Compare with the official dates in [[Flood records 1931-1987]].

#interviews #memory #flooding`,
    },
    {
      id: 'n_site', title: 'Site visit: Marlow Creek outfall', folder: 'f_field', age: 8, created: 27,
      body: `Low tide, grey, cold. The outfall is a brick arch about 2.4 m wide under the coal wharf, with a steel grille added in the 1970s.

## Observations

- Tide marks well above the 1934 invert level
- Fresh silt on the grille, suggesting recent backflow
- Water runs clear after a dry week, and smells of nothing at all, which surprised me

## To do

- [x] Measure the arch
- [ ] Request the 1934 survey sheet from the city archive
- [ ] Return after heavy rain, with the inspector from [[Interview: retired culvert inspector]]

#fieldwork #culverts`,
    },
    {
      id: 'n_records', title: 'Flood records 1931-1987', folder: 'f_field', age: 5, created: 45,
      body: `Transcribed from the city engineer's annual returns. Eleven events on Tessel Street.

| Year | Month | Depth (cm) | Recorded cause |
| ---: | --- | ---: | --- |
| 1931 | March | 40 | River surge |
| 1938 | October | 25 | Blocked culvert |
| 1947 | March | 62 | Snowmelt |
| 1953 | January | 18 | Tidal |
| 1958 | June | 33 | Storm |
| 1968 | July | 47 | Storm |
| 1974 | November | 21 | Blocked culvert |
| 1979 | December | 30 | Storm |
| 1982 | August | 15 | Storm |
| 1985 | September | 26 | Storm |
| 1987 | October | 54 | Storm |

## Cleaning script

\`\`\`python
import csv

with open("returns.csv") as source:
    rows = [r for r in csv.DictReader(source) if r["street"] == "Tessel"]

# [[Thesis outline]] stays unlinked here because this is code, not prose.
print(len(rows))  # 11
\`\`\`

Note that the 1958 entry agrees with the "Whitsun water" in [[Interview: Tessel Street residents]].

#data #flooding #archives`,
    },
    {
      id: 'n_essay', title: 'Essay draft: What a street remembers', folder: 'f_essays', pinned: true, age: 0.02, created: 18,
      body: `For the quarterly's spring issue. 2,500 words, deadline in three weeks.

## Draft

Number 26 Tessel Street has a front step that is thirty-one centimetres tall. There is no reason for it that you could see from the pavement. The house is level, the road is level, and the river that made the step necessary was put in a pipe ninety years ago.

Ask the owner and she will tell you it is *for the water*. Ask which water and she will look at you as though you had asked which sky.

This is what I mean by [[Chapter 3: Flood memory|flood memory]]: a thing a street knows without anyone on it having to know it.

## Still to do

- [ ] Find a stronger ending
- [ ] Cut the second paragraph on insurance
- [x] Check the step height against the [[Interview: Tessel Street residents|threshold survey]]

#essay #memory`,
      versions: [
        { daysAgo: 4, label: 'Before editing', body: `For the quarterly's spring issue. 2,500 words.

## Draft

There is a house on Tessel Street with a very tall front step, and nobody can explain why.

#essay` },
        { daysAgo: 1.5, label: 'Before editing', body: `For the quarterly's spring issue. 2,500 words, deadline in three weeks.

## Draft

Number 26 Tessel Street has a front step that is thirty-one centimetres tall. There is no reason for it that you could see from the pavement.

This is what I mean by flood memory.

## Still to do

- [ ] Find a stronger ending
- [ ] Check the step height

#essay #memory` },
      ],
    },
    {
      id: 'n_glossary', title: 'Glossary', folder: 'f_thesis', age: 30, created: 90,
      body: `| Term | Meaning |
| --- | --- |
| Culverting | Enclosing a watercourse in a pipe or tunnel |
| Daylighting | Reopening a buried watercourse |
| Invert | The lowest inside surface of a culvert |
| Outfall | Where a drain discharges into a larger body of water |
| Backflow | Water pushed up a drain by tide or surge |

Used throughout [[Chapter 2: Buried rivers]].

#reference`,
    },
    {
      id: 'n_supervisor', title: 'Supervisor meetings', folder: 'f_admin', age: 2, created: 60,
      body: `## Latest meeting

Dr Varga thinks chapter 3 is the thesis and chapter 2 is the context. Cut chapter 2 by a third, and move the ward material into a footnote or an appendix. I have marked the changes in the [[Thesis outline]].

- [x] Share the threshold survey
- [ ] Send methods section before the 14th
- [ ] Book a room for the December review

## Previous meeting

Discussed [[Methods: oral history]]. Dr Varga asked whether the pseudonyms hold up, given how small the street is. Checking with the panel.

#admin #planning`,
    },
    {
      id: 'n_routine', title: 'Writing routine', folder: 'f_admin', age: 16, created: 70,
      body: `What has actually worked this term, rather than what I planned.

- Two hours before email, at the kitchen table
- Stop mid-sentence so tomorrow has a way in
- One walk along the old line of the creek each week

Friday is for reading notes only. Everything goes into [[Reading: Rivers Under the City]] or a new reading note the same day, then the [[Thesis outline]] gets updated.

#admin`,
    },
    {
      id: 'n_ideas', title: 'Ideas to sort', folder: null, age: 7, created: 22,
      body: `Loose threads that don't have a home yet.

- A map of every raised step on the old line of the creek, which might become a figure in [[Chapter 3: Flood memory]]
- [[Daylighting costs]]: who has priced this, and who would pay?
- [[Ward assessment rolls]] might be digitised at the county office
- Could [[Essay draft: What a street remembers]] become the introduction in the [[Thesis outline|outline]]?

#ideas`,
    },
    {
      id: 'n_abstract', title: 'Conference abstract, spring', folder: 'f_admin', age: 25, created: 40,
      body: `Abstract for the urban history meeting, 250 words maximum.

Drafted, submitted and accepted. Kept here for the wording.

*Buried rivers survive in habits as well as in pipes. Using interviews and threshold surveys from one street in Aldermouth, this paper argues that flood memory operates as informal engineering knowledge.*

#conference`,
    },
    {
      id: 'n_old', title: 'Old abstract (too long)', folder: 'f_admin', trashedDaysAgo: 3, age: 26, created: 41,
      body: `First attempt at the conference abstract, at 610 words. Superseded by [[Conference abstract, spring]].

#conference`,
    },
  ];

  /** Builds fresh seed data, with all dates relative to `now`. */
  function build(now) {
    const stamp = (daysAgo) => Math.round(now - daysAgo * DAY);
    const notes = NOTES.map((seed) => ({
      id: seed.id,
      title: seed.title,
      body: seed.body,
      folderId: seed.folder,
      pinned: !!seed.pinned,
      createdAt: stamp(seed.created),
      updatedAt: stamp(seed.age),
      deletedAt: seed.trashedDaysAgo ? stamp(seed.trashedDaysAgo) : null,
      versions: (seed.versions || []).map((v) => ({ at: stamp(v.daysAgo), label: v.label, body: v.body })),
    }));
    return { notes, folders: FOLDERS.map((f) => Object.assign({}, f)) };
  }

  MG.Seed = { build };
})(window.MG = window.MG || {});
