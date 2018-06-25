// Applies the changes in our Change array one by one
import { Tree } from "@angular-devkit/schematics";
import { Path } from "typescript";
import { Change, InsertChange, RemoveChange, ReplaceChange } from "../schematics-angular-utils/change";

export function applyChanges(host: Tree, changes: Change[], path: Path) {
    let changeRecorder = host.beginUpdate(path);
    // if (changes.length > 1)
    //     console.log('changes in ' + path);
    for (let change of changes) {
        if (change instanceof InsertChange) {
            //console.log('InsertChange. pos: ' + change.pos + ' newtext: ' + change.toAdd);
            changeRecorder.insertLeft(change.pos, change.toAdd);
        }
        // ReplaceChange first removes the old information and then inserts the new information on the same location
        else if (change instanceof ReplaceChange) {
            //console.log('ReplaceChange. pos: ' + change.pos + ' oldText: ' + change.oldText + ' newtext: ' + change.newText);
            changeRecorder.remove(change.pos, change.oldText.length);
            changeRecorder.insertLeft(change.pos, change.newText);
        }
        else if (change instanceof RemoveChange) {
            //console.log('RemoveChange. pos: ' + change.pos + ' toRemove: ' + change.toRemove);
            changeRecorder.remove(change.pos, change.toRemove.length);
        }
    }
    host.commitUpdate(changeRecorder);
}