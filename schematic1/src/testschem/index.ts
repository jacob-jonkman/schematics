import { Rule, SchematicContext, Tree, chain } from '@angular-devkit/schematics';


// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export function helloworld(options: any): Rule {
	return chain([
		(tree: Tree, _context: SchematicContext) => {
		    tree.create(options.name || 'hello', 'world');
	  	},
	  	(tree: Tree, _context: SchematicContext) => {
	  		const content = tree.read(options.name);
	  		if(!content) {
	  			return;
	  		}

		  	tree.overwrite(options.name, 'Hello ' + content + '!');
            return tree;
        },
	]);
}
