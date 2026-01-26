

- stripe integration
- keep track of the user spreadsheet, and refresh token in stripe

- update the fe to suppor tests

- add a button in th

- fix the font on the demo on the homepage to work (in progress)


- add a few more deterministic rules
- 



- add a dterministic rule that checks to see if the domain is recently registered. 

- add a dterministic check to see if the domain resolves, and has gmail/etc as the mail provider



todo

- interactive demo needs some work (labels on the left should be labels, config box should be wider, trash can instead of x)
- want to surface the deterministic rules as well to the fe 
- add some more test emails. also add some buttons to add even more test emails we can have a ~wild~ one too. 
- remove the "no database needed" cell. do something else. or just have 3 cells
- update the github link


- finish stripe integration, test it with a test stripe account somehow



- add halth check endpoint, add that to docker
- add retry logic to fe, and to api calls from the be to gemini, etc
- 


- add a detemrinistic check to see if the domain that the email comes from is valid. do this by making a simple http get to it. if it fails, label the email as domain-down. if it redirects to a different domain (not just a different subdomain, but a different domain) then mark the email as domain-redirects. these should be two separate determnistic email rules. 


- also, add labels that will mark emails based on what smtp provider was used to send the emaail. you can find this with a mx lookup of the domain. this should be four deterministic rules : 1) it is gmail 2) it is msft 3) it is another, work email eg zoho and 4) it is an automation platform, like aws ses 


 resolves, has a records, can respond to http requests, etc
- you can also check what email service the sender uses, and maybe make a filter if its not gmail or msft 


- we should do a deterministic rule for unsubscribe links too

- the automatino rules should be enabled/disabled with binary yes/no in the google sheets in cells G:H

- add usage analytics. just keep track of usage, dont log email contents

- add sentry

- maybe for redirects also check parent subdomains too