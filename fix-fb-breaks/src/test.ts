const functions = require('firebase-functions');
exports.dbDelete = functions.database.ref('/path').onDelete((event:any) => {
  console.log(event.data);
});
