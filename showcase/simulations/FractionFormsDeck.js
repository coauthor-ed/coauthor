// Fraction forms deck for the landing page's "Quill's Catch"
// (docs/sprints/completed/arcade-quill-catch.md). Groups are fractions; items are
// the same amounts written another way. Every `why` is the one-line working
// the why card shows. Items with no group are traps that look like a member.
export const FRACTION_FORMS = {
  groups: [
    { id: 'half', label: '1/2', tone: 1, why: 'top and bottom divide down to 1 and 2' },
    { id: 'quarter', label: '1/4', tone: 3, why: 'top and bottom divide down to 1 and 4' },
    { id: 'threeq', label: '3/4', tone: 5, why: 'top and bottom divide down to 3 and 4' },
    { id: 'third', label: '1/3', tone: 2, why: 'top and bottom divide down to 1 and 3' },
  ],
  items: [
    { name: '2/4', is: 'half', why: '2/4: divide top and bottom by 2 -> 1/2' },
    { name: '3/6', is: 'half', why: '3/6: divide top and bottom by 3 -> 1/2' },
    { name: '5/10', is: 'half', why: '5/10: divide top and bottom by 5 -> 1/2' },
    { name: '0.5', is: 'half', why: '0.5 is five tenths, 5/10 = 1/2' },
    { name: '50%', is: 'half', why: '50% means 50 out of 100, and 50/100 = 1/2' },
    { name: '2/8', is: 'quarter', why: '2/8: divide top and bottom by 2 -> 1/4' },
    { name: '3/12', is: 'quarter', why: '3/12: divide top and bottom by 3 -> 1/4' },
    { name: '0.25', is: 'quarter', why: '0.25 is 25 hundredths, 25/100 = 1/4' },
    { name: '25%', is: 'quarter', why: '25% is 25/100 = 1/4' },
    { name: '6/8', is: 'threeq', why: '6/8: divide top and bottom by 2 -> 3/4' },
    { name: '9/12', is: 'threeq', why: '9/12: divide top and bottom by 3 -> 3/4' },
    { name: '0.75', is: 'threeq', why: '0.75 is 75 hundredths, 75/100 = 3/4' },
    { name: '75%', is: 'threeq', why: '75% is 75/100 = 3/4' },
    { name: '2/6', is: 'third', why: '2/6: divide top and bottom by 2 -> 1/3' },
    { name: '3/9', is: 'third', why: '3/9: divide top and bottom by 3 -> 1/3' },
    { name: '4/12', is: 'third', why: '4/12: divide top and bottom by 4 -> 1/3' },
    { name: '0.3', is: [], myth: true, why: '0.3 is 3/10. One third is 0.333..., a little more' },
    { name: '0.4', is: [], myth: true, why: '0.4 is 4/10 = 2/5. One quarter is 0.25' },
    { name: '2/3', is: [], why: '2/3 is two thirds: twice as much as 1/3' },
  ],
  targets: ['half', 'quarter', 'threeq', 'third'],
};
