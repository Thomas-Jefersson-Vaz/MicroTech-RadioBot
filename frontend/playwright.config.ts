import {defineConfig} from '@playwright/test';
export default defineConfig({
    testDir:'./test',fullyParallel:true,workers:2,
    use:{baseURL:'http://127.0.0.1:13092',headless:true,trace:'retain-on-failure'},
    webServer:{command:'npm start',url:'http://127.0.0.1:13092',timeout:30000,reuseExistingServer:false,
        env:{FRONTEND_PORT:'13092',NEXT_INTERNAL_PORT:'13093',ENV_FILE:'missing-browser-test.env'}}
});
