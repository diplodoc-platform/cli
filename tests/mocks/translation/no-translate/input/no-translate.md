# No-translate directive

## Block directive
:::no-translate
### No-translate header
Should not be translated.
Can use **markup** inside.
:::

## Leaf directive

::no-translate [## /usr/local/bin/application]
::no-translate[**C:\Program Files\Application\config.ini**]
::no-translate [~/Documents/project/src/main.rs]


- :no-translate[GET /api/v1/users] — get all users
- :no-translate[POST /api/v1/auth/login] — authorization
- :no-translate[PUT /api/v1/users/{id}] — update users data

## Simple case leaf
Install using command.
:no-translate[The default port is unless specified.] Next sentence.
Set NODE_ENV=production for production builds.

## Simple case inline
Install using :no-translate[npm install @company/package] command.
The default port is :no-translate[8080] unless specified.
Set :no-translate[NODE_ENV=production] for production builds.

## Few inline directives
Use :no-translate[**GET /api/v1/users**] to list users and :no-translate[POST /api/v1/users] to create.

## Empty inline directive
This is text with empty :no-translate[] directive.


