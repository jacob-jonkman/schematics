import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp(functions.config().firebase);
const firebaseConfig = functions.config().firebase;
console.log(firebaseConfig);

// Database changes //
exports.dbWrite = functions.database.ref('/path').onWrite(event => {
    const beforeData = event.data.previous.val();
    const afterData = event.data.val();
    console.log(beforeData, afterData);
});
exports.dbUpdate = functions.database.ref('/path').onUpdate(event => {
    const beforeData = event.data.previous.val();
    const afterData = event.data.val();
    console.log(beforeData, afterData);
});
exports.dbCreate = functions.database.ref('/path').onCreate(event => {
    const createdData = event.data.val();
    const parentRef = event.data.adminRef.parent;
    console.log(createdData, parentRef);
});
exports.dbCreate2 = functions.database.ref('/path').onCreate(event => {
    const createdData = event.data.val();
    const parentRef = event.data.adminRef.parent;
    if (!event.data.previous.child('emailVerified').exists() && event.data.child('emailVerified').exists()) {
        console.log(createdData, parentRef);
    }
});
exports.dbCreate3 = functions.database.ref('/path').onCreate(event => {
    if (!event.data.previous.child('emailVerified').exists() && event.data.child('emailVerified').exists()) {
        console.log('event:', event);
    }
});
exports.dbDelete = functions.database.ref('/path').onDelete(event => {
    const deletedData = event.data.previous.val();
    console.log(deletedData, event);
});
exports.dbDelete2 = functions.database.ref('/path').onDelete(event => {
    const thedata = event.data;
    const prev = thedata.previous;
    const val = prev.val();
    const val2 = thedata.previous.val();
    console.log(val, val2, thedata.previous);
});


// Firestore changes //
exports.dbWrite = functions.firestore.document('/path').onWrite((event) => {
    const beforeData = event.data.previous.data();
    const afterData = event.data.data();
    console.log(beforeData, afterData);
});
exports.dbUpdate = functions.firestore.document('/path').onUpdate((event) => {
    const beforeData = event.data.previous.data();
    const afterData = event.data.data();
    console.log(beforeData, afterData);
});
exports.dbCreate = functions.firestore.document('/path').onCreate((event) => {
    const createdData = event.data.data();
    console.log(createdData);
});
exports.dbDelete = functions.firestore.document('/path').onDelete((event) => {
    const deletedData = event.data.data();
    console.log(deletedData);
});
exports.dbDelete2 = functions.firestore.document('/path').onDelete((event) => {
    const theData = event.data;
    const deletedData = theData.data();
    console.log(deletedData);
});


// Auth changes //
exports.authAction = functions.auth.user().onCreate((event) => {
    const creationTime = event.data.metadata.createdAt;
    const lastSignInTime = event.data.metadata.lastSignedInAt;
    console.log(creationTime, lastSignInTime);
});
exports.authAction2 = functions.auth.user().onCreate((userSnapshot) => {
    const userData = userSnapshot.data;
    const userMetadata = userData.metadata;
    const creationTime = userMetadata.createdAt;
    const lastSignInTime = userMetadata.lastSignedInAt;
    console.log(creationTime, lastSignInTime);
});
exports.authAction3 = functions.auth.user().onCreate((event) => {
    const createdAt = 'some date';
    const lastSignedInAt = 'something else';
    console.log(createdAt, lastSignedInAt, event);
});


// Crashlytics changes //
exports.newIssue = functions.crashlytics.issue().onNewDetected((event) => {
    const issue = event.data;
    const issueId = issue.issueId;
    console.log(issueId);
});


// Storage changes //
exports.processFile = functions.storage.object().onChange((event) => {
    const object = event.data;
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
