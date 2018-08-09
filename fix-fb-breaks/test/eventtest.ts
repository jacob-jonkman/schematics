import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp(functions.config().firebase);
const firebaseConfig = functions.config().firebase;
console.log(firebaseConfig);

// Database changes //
exports.dbWrite = functions.database.ref('/path').onWrite((data, context) => {
    const beforeData = data.before.val();// => data.before.val()
    const afterData = data.after.val(); // => data.after.val()
    console.log(beforeData, afterData);
});

exports.dbUpdate = functions.database.ref('/path').onUpdate((data, context) => {
    const beforeData = data.before.val(); // => data.before.val()
    const afterData = data.after.val(); // => data.after.val()
    console.log(beforeData, afterData);
});

exports.dbCreate = functions.database.ref('/path').onCreate((data, context) => {
    const createdData = data.val(); // => data.val()
    //const parentRef = event.data.adminRef.parent; // The Database reference to the parent authorized with admin privileges.
    console.log(createdData);
});

exports.dbDelete = functions.database.ref('/path').onDelete((data, context) => {
    const deletedData = data.val(); // => data.val()
    console.log(deletedData, event); // => console.log(deletedData, data);
});
exports.dbDelete = functions.database.ref('/path').onDelete((data, context) => {
    const thedata = data; // => data
    const prev = thedata; // => thedata;
    const val = prev.val(); // => prev.val()
    const val2 = thedata.val(); // => thedata.val();
    console.log(val, val2, thedata); // => console.log(val, val2, thedata);
});

// Firestore changes //
exports.dbWrite = functions.firestore.document('/path').onWrite((data, context) => {
    const beforeData = data.before.data(); // => data.before.data()
    const afterData = data.after.data(); // => data.after.data()
    console.log(beforeData, afterData);
});
exports.dbUpdate = functions.firestore.document('/path').onUpdate((data, context) => {
    const beforeData = data.before.data(); // => data.before.data()
    const afterData = data.after.data(); // => data.after.data()
    console.log(beforeData, afterData);
});
exports.dbCreate = functions.firestore.document('/path').onCreate((data, context) => {
    const createdData = data.data(); //  => data.data()
    console.log(createdData);
});
exports.dbDelete = functions.firestore.document('/path').onDelete((data, context) => {
    const deletedData = data.data(); // => data.data()
    console.log(deletedData);
});
exports.dbDelete2 = functions.firestore.document('/path').onDelete((data, context) => {
    const theData = data; // => data
    const deletedData = theData.data(); // => theData.data()
    console.log(deletedData);
});

// Auth changes //
exports.authAction = functions.auth.user().onCreate((data, context) => {
    const creationTime = data.metadata.creationTime; // => data.metadata.creationTime
    const lastSignInTime = data.metadata.lastSignInTime; // => data.metadata.lastSignInTime
    console.log(creationTime, lastSignInTime);
});

exports.authAction2 = functions.auth.user().onCreate((userSnapshot, context) => {
    const userData = userSnapshot; // => userSnapshot
    const userMetadata = userData.metadata; // => userData.metadata
    const creationTime = userMetadata.creationTime; // => userMetadata.creationTime
    const lastSignInTime = userMetadata.lastSignInTime; // => userMetadata.lastSignInTime
    console.log(creationTime, lastSignInTime);
});

// These variable names should not be changed
exports.authAction3 = functions.auth.user().onCreate((data, context) => {
    const createdAt = 'some date';
    const lastSignedInAt = 'something else';
    console.log(createdAt, lastSignedInAt, event);
});
