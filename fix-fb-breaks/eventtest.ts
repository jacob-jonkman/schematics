import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp(functions.config().firebase);
const firebaseConfig = functions.config().firebase;
console.log(firebaseConfig);

// Database changes //
exports.dbWrite = functions.database.ref('/path').onWrite(event => {
    const beforeData = event.data.previous.val(); // data before the write
    const afterData = event.data.val(); // data after the write
    console.log(beforeData, afterData);
});

exports.dbUpdate = functions.database.ref('/path').onUpdate(event => {
    const beforeData = event.data.previous.val(); // data before the update
    const afterData = event.data.val(); // data after the update
    console.log(beforeData, afterData);
});

exports.dbCreate = functions.database.ref('/path').onCreate(event => {
    const createdData = event.data.val(); // data that was created
    const parentRef = event.data.adminRef.parent; // The Database reference to the parent authorized with admin privileges.
    console.log(createdData, parentRef);
});

exports.dbDelete = functions.database.ref('/path').onDelete(event => {
    const deletedData = event.data.val(); // data that was deleted
    console.log(deletedData);
});

// Firestore changes //
exports.dbWrite = functions.firestore.document('/path').onWrite((event) => {
    const beforeData = event.data.previous.data(); // data before the write
    const afterData = event.data.data(); // data after the write
    console.log(beforeData, afterData);
});
exports.dbUpdate = functions.firestore.document('/path').onUpdate((event) => {
    const beforeData = event.data.previous.data(); // data before the update
    const afterData = event.data.data(); // data after the update
    console.log(beforeData, afterData);
});
exports.dbCreate = functions.firestore.document('/path').onCreate((event) => {
    const createdData = event.data.data(); // data that was created
    console.log(createdData);
});
exports.dbDelete = functions.firestore.document('/path').onDelete((event) => {
    const deletedData = event.data.data(); // data that was deleted
    console.log(deletedData);
});
exports.dbDelete2 = functions.firestore.document('/path').onDelete((event) => {
    const theData = event.data;
    const deletedData = theData.data(); // data that was deleted
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

// These variable names should not be changed
exports.authAction3 = functions.auth.user().onCreate((event) => {
    const createdAt = 'some date';
    const lastSignedInAt = 'something else';
    console.log(createdAt, lastSignedInAt, event);
});

// Crashlytics //
exports.newIssue = functions.crashlytics.issue().onNewDetected((event) => {
    const issue = event.data;
    const issueId = issue.issueId;
    console.log(issueId);
});

// Storage //
exports.processFile = functions.storage.object().onChange((event) => {
    const object = event.data;
    const filePath = object.name; // Path of the File
    const contentType = object.contentType; // Mime type of the file
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
