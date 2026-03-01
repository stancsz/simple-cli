import * as k8s from '@kubernetes/client-node';
import axios from 'axios';

const kc = new k8s.KubeConfig();
kc.loadFromString(`
apiVersion: v1
clusters:
- cluster:
    server: http://localhost
  name: my-cluster
contexts:
- context:
    cluster: my-cluster
    user: my-user
  name: my-context
current-context: my-context
kind: Config
preferences: {}
users:
- name: my-user
  user:
    token: my-token
`);

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

async function check() {
    try {
        const promise = k8sApi.listNode();
        // Mock a success
        (promise as any).then = (fn: any) => fn({ body: { items: [1,2,3] }, response: { statusCode: 200 } });
        const res = await promise;
        console.log("Mocked result:", Object.keys(res));
    } catch (e: any) { console.log("ERROR:", e.message); }
}
check();
