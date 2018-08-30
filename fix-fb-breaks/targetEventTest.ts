import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
console.log(firebaseConfig);

// Database changes //
exports.dbWrite = functions.database.ref('/path').onWrite((data, context) => {
    const beforeData = data.before.val();
    const afterData = data.after.val();
    console.log(beforeData, afterData);
});
exports.dbUpdate = functions.database.ref('/path').onUpdate((data, context) => {
    const beforeData = data.before.val();
    const afterData = data.after.val();
    console.log(beforeData, afterData);
});
exports.dbCreate = functions.database.ref('/path').onCreate((data, context) => {
    const createdData = data.val();
    const parentRef = data.ref.parent;
    console.log(createdData, parentRef);
});
exports.dbCreate2 = functions.database.ref('/path').onCreate((data, context) => {
    const createdData = data.val();
    const parentRef = data.ref.parent;
    if (!data.before.child('emailVerified').exists() && data.child('emailVerified').exists()) {
        console.log(createdData, parentRef);
    }
});
exports.dbCreate3 = functions.database.ref('/path').onCreate((data, context) => {
    if (!data.before.child('emailVerified').exists() && data.child('emailVerified').exists()) {
        console.log('event:', data);
    }
});
exports.dbDelete = functions.database.ref('/path').onDelete((data, context) => {
    const deletedData = data.val();
    console.log(deletedData, data);
});
exports.dbDelete2 = functions.database.ref('/path').onDelete((data, context) => {
    const thedata = data;
    const prev = thedata;
    const val = prev.val();
    const val2 = thedata.val();
    console.log(val, val2, thedata);
});


// Firestore changes //
exports.dbWrite = functions.firestore.document('/path').onWrite((data, context) => {
    const beforeData = data.before.data();
    const afterData = data.after.data();
    console.log(beforeData, afterData);
});
exports.dbUpdate = functions.firestore.document('/path').onUpdate((data, context) => {
    const beforeData = data.before.data();
    const afterData = data.after.data();
    console.log(beforeData, afterData);
});
exports.dbCreate = functions.firestore.document('/path').onCreate((data, context) => {
    const createdData = data.data();
    console.log(createdData);
});
exports.dbDelete = functions.firestore.document('/path').onDelete((data, context) => {
    const deletedData = data.data();
    console.log(deletedData);
});
exports.dbDelete2 = functions.firestore.document('/path').onDelete((data, context) => {
    const theData = data;
    const deletedData = theData.data();
    console.log(deletedData);
});


// Auth changes //
exports.authAction = functions.auth.user().onCreate((data, context) => {
    const creationTime = data.metadata.creationTime;
    const lastSignInTime = data.metadata.lastSignInTime;
    console.log(creationTime, lastSignInTime);
});
exports.authAction2 = functions.auth.user().onCreate((userSnapshot, context) => {
    const userData = userSnapshot;
    const userMetadata = userData.metadata;
    const creationTime = userMetadata.creationTime;
    const lastSignInTime = userMetadata.lastSignInTime;
    console.log(creationTime, lastSignInTime);
});
exports.authAction3 = functions.auth.user().onCreate((data, context) => {
    const createdAt = 'some date';
    const lastSignedInAt = 'something else';
    console.log(createdAt, lastSignedInAt, data);
});


// Crashlytics changes //
exports.newIssue = functions.crashlytics.issue().onNew((data, context) => {
    const issue = data;
    const issueId = issue.issueId;
    console.log(issueId);
});


// Storage changes //
exports.processFile = functions.storage.object().onChange((data, context) => {
    const object = data;
    const filePath = object.name;
    const contentType = object.contentType;
    console.log(filePath, contentType);

    if (object.resourceState === 'not_exists') {
        console.log('This file was deleted.');
        return null;
    }
    if (object.resourceState === 'exists' && object.metageneration > 1) {
        console.log('This is a metadata change event.');
        return null;
    }
});
