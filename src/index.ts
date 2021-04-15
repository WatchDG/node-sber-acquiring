import {HttpInstance} from "http-instance";
import {URLSearchParams} from 'url';
import {fail, ok, TResultAsync, tryCatchAsync, tryCatch} from "node-result";
import {IncomingHttpHeaders} from "http";

interface AuthLogin {
    userName: string;
    password: string;
}

type Options = {
    baseUrl: string;
} & AuthLogin;

type CreateOrder = {
    orderNumber: string;
    amount: number;
    returnUrl: string;
    failUrl?: string;
};

type Order = {
    orderId: string;
    formUrl: string;
}

export class SberAcquiring {
    private readonly instance: HttpInstance;
    private readonly auth: AuthLogin;

    constructor(options: Options) {
        const {baseUrl, userName, password} = options;
        this.instance = new HttpInstance({
            baseUrl
        });
        this.auth = {
            userName,
            password
        };
    }

    @tryCatch
    private static checkBody(status: number, headers: IncomingHttpHeaders, body?: any) {
        if (body.errorCode) {
            return fail(new Error(`[${body.errorCode}] ${body.errorMessage}`));
        }
        return ok(null);
    }

    @tryCatchAsync
    async createOrder(createOrder: CreateOrder): TResultAsync<Order, Error> {
        const payload = Object.assign({}, createOrder, this.auth) as Record<string, any>;
        const params = new URLSearchParams(payload);
        const {
            status,
            headers,
            data
        } = (await this.instance.post<Order>('/payment/rest/register.do', params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })).unwrap();
        (SberAcquiring.checkBody(status, headers, data)).unwrap();
        return ok(data!);
    }
}