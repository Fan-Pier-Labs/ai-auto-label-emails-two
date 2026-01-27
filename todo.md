# todo list 

- [ ] add a stripe integration
- [ ] store the google sheet id and gmail refresh token in stripe
- [ ] add analytics: just log. just keep track of usage, dont log email contents. eg log (processed 3 emails for user with name X Y and email X@Y.com )
- [ ] add sentry. enable the session recording and error tracking and log tracking. 


deterministic rules 

- [ ] add a deterministic rule that checks to see if the domain is recently registered. (can we have a rule that takes in a parameter?)
- [ ] add a deterministic check to see if the domain resolves, and has gmail/etc as the mail provider
- [ ] we need to support enabling/disabling these in google sheets


- [ ] add a deterministic check to see if the domain that the email comes from is valid. do this by making a simple http get to it. if it fails, label the email as domain-down. if it redirects to a different domain (not just a different subdomain, but a different domain) then mark the email as domain-redirects. these should be two separate deterministic email rules. 
- [ ] also, add labels that will mark emails based on what smtp provider was used to send the emaail. you can find this with a mx lookup of the domain. this should be four deterministic rules : 1) it is gmail 2) it is msft 3) it is another, work email eg zoho and 4) it is an automation platform, like aws ses 
- [ ] you could do some other domain checks eg does it have other dns records like txt
- [ ] we should do a deterministic rule for unsubscribe links too



todo

- [ ] interactive demo needs some work (labels on the left should be labels, config box should be wider, trash can instead of x)
- [ ] want to surface the deterministic rules as well to the fe. this can be another section below the ai rules demo portion.
- [ ] add some more test emails. also add a button to add even more test emails these emails can be hardcoded in the frontend, and just added when the user clicks the add button. Also, add another button that says "Add ~wild~ emails" and we can have it add a bunch of hilarious emails
- [ ] remove the "no database needed" cell. do something else. or just have 3 cells
- [ ] update the github link


infra 

- [ ] add health check endpoint, add that to docker
- [ ] add retry logic to fe, and to api calls from the be to gemini, etc


# dreams
- [ ] add a ai rule to process individual events that i have been invited to, and have an ai prompt to determine whether i should register for the event or not.