# -*- coding: utf-8 -*-
import json
import logging
import re

from datetime import datetime
from requests.utils import dict_from_cookiejar
from threading import Thread, Timer
from websocket import create_connection

from streamlink.exceptions import PluginError
from streamlink.plugin import Plugin, PluginArgument, PluginArguments
from streamlink.plugin.api import useragents, validate
from streamlink.stream import RTMPStream

log = logging.getLogger(__name__)


class FC2(Plugin):

    url_login = 'https://secure.id.fc2.com/?mode=login&switch_language=en'
    url_member_api = 'https://live.fc2.com/api/memberApi.php'
    url_server = 'https://live.fc2.com/api/getControlServer.php'

    _url_re = re.compile(r'''https?://live\.fc2\.com/(?P<user_id>\d+)/?$''')

    _version_schema = validate.Schema({
        'status': int,
        'data': {
            'channel_data': {
                'channelid': validate.text,
                'userid': validate.text,
                'adult': int,
                'login_only': int,
                'version': validate.text,
                'fee': int,
            },
            'user_data': {
                'is_login': int,
                'userid': int,
                'fc2id': int,
                'name': validate.text,
                'point': int,
                'adult_access': int,
                'recauth': int,
            }
        }
    })

    count = 0
    count_ping = 0

    host_data = ''
    host_found = False

    arguments = PluginArguments(
        PluginArgument(
            'username',
            requires=['password'],
            metavar='USERNAME',
            help='The username associated with your FC2 account.',
        ),
        PluginArgument(
            'password',
            sensitive=True,
            metavar='PASSWORD',
            help='A FC2 account password to use with --fc2-username',
            prompt='Enter FC2 password'
        ),
        PluginArgument(
            'purge-credentials',
            action='store_true',
            help='''
        Purge cached FC2 credentials to initiate a new session
        and reauthenticate.
        '''
        )
    )

    @classmethod
    def can_handle_url(cls, url):
        return cls._url_re.match(url)

    def _login(self, username, password):
        '''login and update cached cookies'''
        log.debug('login ...')
        self.session.http.get(self.url)
        data = {
            'pass': password,
            'email': username,
            'done': 'livechat',
            'keep_login': 1
        }

        self.session.http.post(self.url_login, data=data, allow_redirects=True)
        cookies_list = self.save_cookies()

        return self.cmp_cookies_list(cookies_list)

    def _get_version(self, user_id):
        data = {
            'user': 1,
            'channel': 1,
            'profile': 1,
            'streamid': int(user_id)
        }
        res = self.session.http.post(self.url_member_api, data=data)
        res_data = self.session.http.json(res, schema=self._version_schema)
        channel_data = res_data['data']['channel_data']
        user_data = res_data['data']['user_data']

        if (channel_data['login_only'] != 0 and user_data['is_login'] != 1):
            raise PluginError('A login is required for this stream.')

        if channel_data['fee'] != 0:
            raise PluginError('Only streams without a fee are supported.')

        version = channel_data['version']
        if user_data['is_login']:
            log.info('Logged in as {0}'.format(user_data['name']))
        log.debug('Found version: {0}'.format(version))
        return version

    def payload_msg(self, name):
        ''' Format the WebSocket message '''
        self.count_ping += 1
        payload = json.dumps(
            {
                'name': str(name),
                'arguments': {},
                'id': int(self.count_ping)
            }
        )
        return payload

    def _get_ws_url(self, user_id, version):
        log.debug('_get_ws_url ...')
        data = {
            'channel_id': user_id,
            'channel_version': version,
            'client_type': 'pc',
            'client_app': 'browser'
        }

        res = self.session.http.post(self.url_server, data=data)
        w_data = self.session.http.json(res)
        if w_data['status'] == 11:
            raise PluginError('The broadcaster is currently not available')

        ws_url = '{0}?control_token={1}&mode=pay&comment=0'.format(
            w_data['url'], w_data['control_token'])
        log.debug('WS URL: {0}'.format(ws_url))
        return ws_url

    def _get_ws_data(self, ws_url):
        log.debug('_get_ws_data ...')
        ws = create_connection(ws_url)
        ws.send(self.payload_msg('get_media_server_information'))

        def ws_ping():
            ''' ping the WebSocket '''
            if ws.connected is True:
                t1 = Timer(30.0, ws_ping)
                t1.daemon = True
                t1.start()
                ws.send(self.payload_msg('heartbeat'))

        def ws_recv():
            ''' print WebSocket messages '''
            while True:
                self.count += 1
                data = json.loads(ws.recv())
                time_utc = datetime.utcnow().strftime('%H:%M:%S UTC')
                if data['name'] not in ['comment', 'ng_commentq',
                                        'user_count', 'ng_comment']:
                    log.debug('{0} - {1} - {2}'.format(
                        time_utc, self.count, data['name']))

                if (data['name'] == '_response_'
                        and data['arguments'].get('host')):
                    log.debug('Found host data')
                    self.host_data = data
                    self.host_found = True
                elif data['name'] == 'media_connection':
                    log.debug('successfully opened stream')
                elif data['name'] == 'control_disconnection':
                    if self.count <= 30:
                        # User with points restricted program being broadcasted
                        self.count = 30
                    if data.get('arguments').get('code') == 4512:
                        log.debug('Disconnected from Server')
                    break
                elif data['name'] == 'publish_stop':
                    log.debug('Stream ended')
                elif data['name'] == 'channel_information':
                    if data['arguments'].get('fee') != 0:
                        log.error('Stream requires a fee now.'.format(
                            data['arguments'].get('fee')))
                        break
                elif data['name'] == 'media_disconnection':
                    if data.get('arguments').get('code') == 104:
                        log.warning('Disconnected. '
                                    'Multiple connections has been detected.')
                    elif data.get('arguments').get('code'):
                        log.debug('error code {0}'.format(
                            data['arguments']['code']))

            ws.close()

        # WebSocket background process
        ws_ping()
        t2 = Thread(target=ws_recv)
        t2.daemon = True
        t2.start()

        # wait for the WebSocket
        host_timeout = False
        while self.host_found is False:
            if self.host_found is True:
                break
            if self.count >= 30:
                host_timeout = True
                break

        log.debug('host_timeout is {0}'.format(host_timeout))
        if host_timeout:
            return False
        return True

    def _get_rtmp(self, data):
        log.debug('_get_rtmp ...')

        app = '{0}?media_token={1}'.format(
            data['application'], data['media_token'])
        host = data['host']

        params = {
            'app': app,
            'flashVer': 'WIN 29,0,0,140',
            'swfUrl': 'https://live.fc2.com/swf/liveVideo.swf',
            'tcUrl': 'rtmp://{0}/{1}'.format(host, app),
            'live': 'yes',
            'pageUrl': self.url,
            'playpath': data['play_rtmp_stream'],
            'host': host,
        }
        yield 'live', RTMPStream(self.session, params)

    def cmp_cookies_list(self, cookies_list):
        required_cookies = [
            'FCSID', 'fcu', 'fgcv', 'glgd_val',
            'login_status', 'PHPSESSID', 'secure_check_fc2',
        ]
        count = 0
        for c in required_cookies:
            if c in cookies_list:
                count += 1
        log.debug('Same Cookies: {0}'.format(count))
        return (count == len(required_cookies))

    def _get_streams(self):
        log.debug('Version 2018-07-12')
        log.info('This is a custom plugin. '
                 'For support visit https://github.com/back-to/plugins')

        if self.options.get('purge_credentials'):
            self.clear_cookies()
            log.info('All credentials were successfully removed.')

        self.session.http.headers.update({
            'User-Agent': useragents.FIREFOX,
            'Referer': self.url
        })

        cookies_list = []
        for k in dict_from_cookiejar(self.session.http.cookies):
            cookies_list.append(k)
        _authed = self.cmp_cookies_list(cookies_list)

        login_username = self.get_option('username')
        login_password = self.get_option('password')

        if _authed:
            log.info('Attempting to authenticate using cached cookies')
        elif (not _authed and login_username and login_password):
            if not self._login(login_username, login_password):
                log.error('Failed to login, check your username/password')

        match = self._url_re.match(self.url)
        if not match:
            return

        user_id = match.group('user_id')

        version = self._get_version(user_id)
        ws_url = self._get_ws_url(user_id, version)
        if self._get_ws_data(ws_url):
            return self._get_rtmp(self.host_data['arguments'])


__plugin__ = FC2
