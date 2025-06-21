@echo off

:head
echo Starting service...
waitress-serve --port=8099 api:api
goto head