const DB = {
  teams: [{id: 1}, {id: 2}],
  results: [{homeId: 1, awayId: 2}, {homeId: 3, awayId: 4}],
};
const id = 1;
const newResults = DB.results.filter(r => r.homeId !== id && r.awayId !== id);
console.log(newResults);
