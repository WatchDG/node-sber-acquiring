import {HttpInstance} from "http-instance";
import {URLSearchParams} from 'url';
import {fail, ok, tryCatchAsync, tryCatch, TResult} from "node-result";
import type {TResultAsync} from "node-result";
import type {IncomingHttpHeaders} from "http";
import {createPublicKey, verify} from "crypto";

interface AuthLogin {
    userName: string;
    password: string;
}

interface AuthToken {
    token: string;
}

type Options = {
    baseUrl: string;
} & (AuthToken | AuthLogin);

type CreateOrder = {
    orderNumber: string;
    amount: number;
    returnUrl: string;
    failUrl?: string;
    dynamicCallbackUrl?: string;
};

type Order = {
    orderId: string;
    formUrl: string;
}

type OrderStatus = {
    orderNumber: string;
    orderStatus?: number;
    actionCode: number;
    actionCodeDescription: string;
    paymentAmountInfo: {
        paymentState?: string;
        approvedAmount?: number;
        depositedAmount?: number;
        refundedAmount?: number;
        feeAmount?: number;
    }
}

const isAuthLogin = (params: AuthLogin | AuthToken): params is AuthLogin => !!(params as AuthLogin).userName && !!(params as AuthLogin).password;
const isAuthToken = (params: AuthLogin | AuthToken): params is AuthToken => !!(params as AuthToken).token;

const getAuth = (params: AuthLogin | AuthToken): AuthToken | AuthLogin => {
    if (isAuthLogin(params)) {
        const {userName, password} = params;
        return {userName, password} as AuthLogin;
    }
    if (isAuthToken(params)) {
        const {token} = params;
        return {token} as AuthToken;
    }
    throw new Error('AuthLogin and AuthToken not found');
}

interface OrderId {
    orderId: string;
}

interface OrderNumber {
    orderNumber: string;
}

const isOrderId = (params: OrderId | OrderNumber): params is OrderId => !!(params as OrderId).orderId;
const isOrderNumber = (params: OrderId | OrderNumber): params is OrderNumber => !!(params as OrderNumber).orderNumber;

const getOrderId = (params: OrderId | OrderNumber): OrderId | OrderNumber => {
    if (isOrderId(params)) {
        const {orderId} = params;
        return {orderId} as OrderId;
    }
    if (isOrderNumber(params)) {
        const {orderNumber} = params;
        return {orderNumber} as OrderNumber;
    }
    throw new Error('OrderId and OrderNumber not found');
};

export class SberAcquiring {
    private readonly instance: HttpInstance;
    private readonly auth: AuthLogin | AuthToken;

    constructor(options: Options) {
        const {baseUrl} = options;
        this.auth = getAuth(options);
        this.instance = new HttpInstance({
            baseUrl
        });
    }

    @tryCatch
    private static checkBody(status: number, headers: IncomingHttpHeaders, body?: any) {
        if (body.errorCode && body.errorCode !== '0') {
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

    @tryCatchAsync
    async getOrderStatus(orderId: OrderId | OrderNumber): TResultAsync<OrderStatus, Error> {
        const orderIdObj = getOrderId(orderId);
        const payload = Object.assign(orderIdObj, this.auth) as Record<string, any>;
        const params = new URLSearchParams(payload);
        const {
            status,
            headers,
            data
        } = (await this.instance.post<OrderStatus>('/payment/rest/getOrderStatusExtended.do', params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })).unwrap();
        (SberAcquiring.checkBody(status, headers, data)).unwrap();
        return ok(data!);
    }

    @tryCatch
    static verifyCallback(qs: string, cert: string, algorithm: string = 'RSA-SHA512'): TResult<boolean, Error> {

        const object = Object.fromEntries(qs.split('&').map((param) => param.split('=')));

        const checksum = object.checksum;

        const data = Object.keys(object)
            .filter((key) => key !== 'sign_alias' && key !== 'checksum')
            .sort()
            .map((key) => `${key};${object[key]};`)
            .join('');

        const publicKey = createPublicKey(cert);

        return ok(verify(algorithm, Buffer.from(data), publicKey, Buffer.from(checksum, 'hex')));
    }
}