import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
import { check, sleep } from 'k6';
import { SharedArray } from "k6/data";
import { parseHTML } from "k6/html";
import http from 'k6/http';

const domain = 'https://test.k6.io'; // Parameterize the domain to make it easier to change environments.
let token = 'NOT FOUND'; // Initialize the csrftoken variable.

const sharedData = new SharedArray("Shared Logins", function() {
    let data = papaparse.parse(open('users.csv'), { header: true }).data;
    return data;
});

// Define Scenario 1.
export function S01_HomeOnly () {
    VisitHomePage();
}

// Define Scenario 2.
export function S02_MessagesLogin () {
    VisitMessagesPage();
    LogIn();
}

//Visit the Home page.
export function VisitHomePage () {
    // Do an HTTP GET of the homepage, and name this request 01_Home for ease of analysis.
    let response = http.get(domain, {tags: { name: '01_Home' }});
    
    // Verify text returned in the response. An HTTP 200 response means a page was returned; not necessarily the right one.
    check(response, {
      '01 - home page should contain expected body': (r) => r.body.includes("Collection of simple web-pages suitable for load testing")
    });
    
    // Add dynamic think time between 0 and 4s.
    sleep(Math.random() * 5);
}

export function VisitMessagesPage () {
    // Visit the Messages page and call this request 02_Messages for ease of analysis.
    let messagesUrl = `${domain}/my_messages.php`;
    let options = {
        tags: {
            name: '02_Messages',
        },
    };
    let response = http.get(messagesUrl, options);

    // Verify that "Unauthorized" is returned in the response.
    check(response, {
        '02 - messages page should contain expected body': (r) => r.body.includes("Unauthorized")
      });

    // Extract the csrfToken, which has a dynamic value, from the response.
    let doc = parseHTML(response.body);
    token = doc.find('input[name="csrftoken"]').val();
    
    // Write the token to log for debugging purposes.
    // console.log('token:', token);
    
    // Add dynamic think time between 0 and 14s to allow for time to type login credentials.
    sleep(Math.random() * 15);
}

export function LogIn () {

    // Get random user from shared array created using the CSV file users.csv.
    let randomUser = sharedData[Math.floor(Math.random() * sharedData.length)]

    // Define the parameters to be sent with the HTTP POST, including credentials from users.csv.
    let params = {
        redir: '1',
        login: randomUser.username,
        password: randomUser.password,
        csrftoken: token,
    }

    // Submit login credentials via an HTTP POST.
    let response = http.post(
        domain + '/login.php', 
        params, 
        {tags: { name: '03_MessagesLogIn' }}
    );

    // Verify successful login by checking that the response contains "Welcome, username!"
    check(response, {
        '03_user should be logged in': (r) => r.body.includes('Welcome, ', randomUser.username, '!')
    });

    // Add dynamic think time between 0 and 4s.
    sleep(Math.random() * 4);
}



export let options = {
    scenarios: {
        home: {
            executor: 'ramping-vus',
            exec: 'S01_HomeOnly',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 20 },
                { duration: '60s', target: 20 },
            ],
            gracefulRampDown: '60s',
        },
        messages: {
            executor: 'ramping-vus',
            exec: 'S02_MessagesLogin',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 5 },
                { duration: '60s', target: 5 },
            ],
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.05'], 
        http_req_duration: ['p(95)<3000'], 
        checks: ['rate>0.95'], 
    },
};